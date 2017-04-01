/*

  Repeatedly get values of realtime and monotonic clocks with microsecond
  precision as a JSON string of the form
  {"real":XXX.XXXXXX,"mono":YYY.YYYYYY}
  Each time a character is read from stdin, the time is read and a JSON
  string is written to stdout, which is then flushed.

  If an error occurs on reading stdin, get_clocks terminates.

  If started with an argument, that is assumed to be the filename of a PPS
  signal hardware line, and the realtime and monotonic clocks for that PPS
  signal are also output.

  Author: John Brzustowski
  Licence: public domain

*/ 
#include <time.h>
#include <stdio.h>
#include <poll.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>

main (int argc, char *argv[]) {
  struct timespec tmm, tmr, ppsm, ppsr;
  double real, mono, ppsreal, ppsmono;
  struct pollfd pollFDs[2];
  int numFD = 0;
  int i;
  int rv;
  char buf;

  pollFDs[numFD].fd = fileno(stdin);
  pollFDs[numFD++].events = POLLIN;
  if (argc > 1) {
    pollFDs[numFD].fd = open(argv[1], O_RDONLY);
    pollFDs[numFD++].events = POLLPRI;
  }

  for (;;) {
    rv=poll(pollFDs, numFD, -1);
    printf("Poll returned %d\n", rv);
    if (pollFDs[0].revents & (POLLERR | POLLHUP))
      break;
    if (numFD > 1 && pollFDs[1].revents & POLLPRI) {
      clock_gettime(CLOCK_MONOTONIC, &ppsm);
      clock_gettime(CLOCK_REALTIME, &ppsr);
      ppsreal = ppsr.tv_sec + ppsr.tv_nsec / 1.0e9;
      ppsmono = ppsm.tv_sec + ppsm.tv_nsec / 1.0e9;
      lseek(pollFDs[1].fd, 0, SEEK_SET);
      read(pollFDs[1].fd, &buf, 1);
      printf("Got PPS and read of %c\n", buf);
    };
    if (pollFDs[0].revents & POLLIN) {
      clock_gettime(CLOCK_MONOTONIC, &tmm);
      clock_gettime(CLOCK_REALTIME, &tmr);
      real = tmr.tv_sec + tmr.tv_nsec / 1.0e9;
      mono = tmm.tv_sec + tmm.tv_nsec / 1.0e9;
    }
    if (numFD > 1) {
      printf("{\"real\":%.6lf, \"mono\":%.6lf, \"ppsreal:\":%.6lf, \"ppsmono\":%.6lf}\n", real, mono, ppsreal, ppsmono);
    } else {
      printf("{\"real\":%.6lf, \"mono\":%.6lf}\n", real, mono);
    }
    fflush(stdout);
  }
}

