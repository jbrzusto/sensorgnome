/*

  Package a raw audio input stream as .WAV file output.  Output 
  is sent as a single-file reply to an HTTP request.

*/

/*

      Constructor parameters:

      inStream: a readableStream which supplies the raw audio data.

      rate: the audio sampling rate in Hz

      channels: the number of audio channels (1 or 2, presumably)

      numFrames: the number of frames to write

      output: an http.ServerResponse object.  data are written
              with appropriate HTTP headers as if the .wav data were
              being served from a static file.  At most one .wav file
              of data is written, although writing will stop earlier
              if there is an error writing to "output" (e.g. if the
              socket listener closes).


*/

WavMaker = function(inStream, rate, channels, numFrames, output) {
    this.inStream           = inStream;
    this.rate               = rate;
    this.channels           = channels;
    this.numFrames          = numFrames;
    this.output             = output;
    
    this.frameCountdown     = numFrames;
    this.didHeader          = false;

    this.bitsPerSample      = 16; // fixme?: hard-coded S16_LE

    this.bytesPerFrame      = this.channels * this.bitsPerSample / 8;

    // callbacks closure
    this.this_gotData = this.gotData.bind(this);
    this.this_stop = this.stop.bind(this);

    output.on("error", this.this_stop);
//        output.stream.on("close", this.this_stop);

    inStream.on("data", this.this_gotData);

    // initialize raw streaming from VAH
    inStream.start();
};

WavMaker.prototype.stop = function() {
    if (this.inStream) {
        this.inStream.stop();
        this.inStream = null;
    }
    this.output.destroy();
    this.output = null;
};

WavMaker.prototype.header = new Buffer(
    "RIFF" + // file-chunk tag
    "1234" + // 4 byte size of remainder of file (bytes);         offset 4
    "WAVE" + // sub-chunk tag
    "fmt " + // format chunk tag
    "1234" + // 4 byte size of remainder of format chunk (bytes); offset 16
    "12"   + // 2 byte format code;                               offset 20
    "12"   + // 2 byte number of channels;                        offset 22
    "1234" + // 4 byte sampling rate (frames / sec);              offset 24
    "1234" + // 4 byte data rate (bytes/sec);                     offset 28
    "12"   + // 2 byte frame size (bytes);                        offset 32
    "12"   + // 2 byte sample size (bits);                        offset 34
    "data" + // data chunk tag
    "1234"   // 4 byte size of remainder of data chunk;           offset 40
);

WavMaker.prototype.fillHeader = function() {
    // this.framesPerWav must have been filled in by the caller

    this.dataBytesPerWav = this.bytesPerFrame * this.numFrames;
    this.bytesPerWav     = this.dataBytesPerWav + 44;

            // fill in the WAV header                          Offset
    this.header.writeUInt32LE(this.bytesPerWav - 8           ,  4); // total size after 8-byte header
    this.header.writeUInt32LE(16                             , 16); // size of fmt chunk
    this.header.writeUInt16LE(1                              , 20); // format code 1: PCM
    this.header.writeUInt16LE(this.channels                  , 22); // number of channels
    this.header.writeUInt32LE(this.rate                      , 24); // sampling rate
    this.header.writeUInt32LE(this.rate * this.channels * 2  , 28); // data rate
    this.header.writeUInt16LE(this.channels * 2              , 32); // frame size
    this.header.writeUInt16LE(16                             , 34); // sample size
    this.header.writeUInt32LE(this.dataBytesPerWav           , 40); // bytes in data chunk
};

WavMaker.prototype.stopListening = function() {
    this.inStream.removeListener("data", this.this_gotData);
    this.this_gotData = null;
};

WavMaker.prototype.gotData = function(data) {
/*
  write data, possibly preceded by http and WAV headers
*/
    
    if (!this.didHeader) {

        // write an HTTP header 
        this.output.writeHead(206, "Partial Content", {
            "Accept-Ranges": "bytes",
            "Content-Length": this.numFrames,
            "Content-Range": "bytes 0-" + (this.numFrames - 1) + "/" + this.numFrames,
            "Keep-Alive": "timeout=15, max=100",
            "Connection": "Keep-Alive",
            "Content-Type": "audio/x-wav"
        });

        // write the .WAV header
        this.fillHeader();
        this.output.write(this.header);
        this.didHeader = true;
    }

    var newFrames = data.length / this.bytesPerFrame;
    var framesToWrite = Math.min(this.frameCountdown, newFrames);
    this.output.write(data.slice(0, framesToWrite * this.bytesPerFrame));
    this.frameCountdown -= framesToWrite;
    if (! this.frameCountdown) {
        this.stopListening();
        this.output.end();
        this.output = null;
    }
};

exports.WavMaker = WavMaker;
