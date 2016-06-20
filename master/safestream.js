/*
  safestream.js : safe writable stream on a disk, which writes in both
  uncompressed text and .gz simultaenously, erasing the plain text and
  starting new files after CHUNKBYTES (uncompressed) bytes have been
  written to the .gz file.

  Also, when a gpsSetClock event is detected on TheMatron, re-open 
  the current streams so that the filename encodes the new timestamp.

  required globals: DataSaver, GPS, Zlib

*/

SafeStream = function (matron, source, ext, chunkbytes, chunksecs) {
    // get a stream for writing data in compressed form
    // this does the following:
    // - writes data simultaenously to files FILE.XXX and FILE.XXX.gz
    // - whenever the amount written to FILE.XXX has reached chunkbytes,
    //   we close the gz FILE.XXX.gz, forcing it to disk, and then delete the FILE.XXX file,
    //   we then re-open a new stream with the current time.
    
    // source will usually be "all", and extension will usually be ".txt"

    this.source = source;
    this.ext = ext;
    this.chunkbytes = chunkbytes;
    this.chunksecs = chunksecs;
    this.lastData = null;
    this.this_gpsSetClock = this.gpsSetClock.bind(this);
    this.this_streamError = this.streamError.bind(this)
    this.setupStreams();
    matron.on("gpsSetClock", this.this_gpsSetClock);
};

SafeStream.prototype.setupStreams = function() {
    var path = DataSaver.getRelPath(this.source);
    this.sout = DataSaver.getStream(path, this.ext);
    this.sout.stream.on("error", this.this_streamError);
    this.soutgz = DataSaver.getStream(path, this.ext + ".gz")
    this.soutgz.stream.on("error", this.this_streamError);
    this.gzstream = Zlib.createGzip();
    this.gzstream.pipe(this.soutgz.stream);
    this.bytesWritten = 0;
    this.chunkTimerElapsed = false;
    if (this.chunkTimer)
        clearTimeout(this.chunkTimer);
    this.chunkTimer = setTimeout(this.chunkTimerHandler, this.chunksecs * 1000, this);
};

SafeStream.prototype.chunkTimerHandler = function(self) {
    self.chunkTimerElapsed = true;
};

SafeStream.prototype.write = function (data) {
    this.lastData = data;
    this.sout.stream.write(data);
    this.gzstream.write(data);
    this.bytesWritten += data.length;
    if (this.bytesWritten >= this.chunkbytes || this.chunkTimerElapsed) {
        this.end();
        this.setupStreams();
    }
};

SafeStream.prototype.end = function(nodelete) {
    if (this.gzstream) {
        this.gzstream.end();
        this.gzstream = null;
    }
    if (this.sout.stream) {
        this.sout.stream.end();
        this.sout.stream = null;
    }
    if (! nodelete) {
        /*
        delete the uncompressed text version of the file.  Note: we
        must use the asynchronous version so that the caller can
        immediately set up streams again.  Otherwise, while we waited
        for fs.unlinkSync, data might come in and trigger an error
        because no streams were set up.  This led to extra short files
        being generated after each chunk.
        */
        Fs.unlink(this.sout.path, this.doNothing);
    }
};

SafeStream.prototype.doNothing = function() {
};

SafeStream.prototype.streamError = function(e) {
    this.end(true);
    this.setupStreams();
    // retry writing last data; this may lead to some
    // of lastData being written to two different files
    if (this.lastData)
        this.write(this.lastData);
};

SafeStream.prototype.gpsSetClock = function(d) {
    this.end();
    this.setupStreams();
};

exports.SafeStream = SafeStream;
