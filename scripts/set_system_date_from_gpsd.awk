#!/usr/bin/gawk -f

# Set the system date and time (once) from GPS. 
# The beaglebone boots with its system clock set to the last value it had when
# it was powered down, which is of course incorrect.

# In general, we use a GPS (and gpsd) to maintain the correct time via
# NTP (and ntpd), but ntpd chokes on GPS times if they are more than 4
# hours different from the system time, as will be the case if the
# beaglebone has been off for more than 4 hours, as discussed here:

# https://groups.google.com/group/comp.protocols.time.ntp/tree/browse_frm/thread/f0c4aa2b3adce26a/81e170c1ca0c8a0d?hl=en&rnum=1&_done=%2Fgroup%2Fcomp.protocols.time.ntp%2Fbrowse_frm%2Fthread%2Ff0c4aa2b3adce26a%2F81e170c1ca0c8a0d%3Fhl%3Den%26pli%3D1%26#doc_455ae6c796546e73

# So we use this script to set system time by waiting for an NMEA GPZDA message from the GPS.
# From then on, ntpd will accept times from gpsd.
#
# Note: this script should be run in the background, as it might take some time for gpsd
# to generate time messages. (Especially with a cold start).  Also, it should be run
# as root so that /tmp/gps.initial.timefix can be deleted and recreated

BEGIN {
    FLAGFILE = "/tmp/gps.initial.timefix";
    FS = ",";
    while ("gpspipe -r" | getline) {
        if ($0 ~ /^\$GPRMC/) {
	    
	    system(sprintf("date -u %02d%02d%02d%02d%04d.%02d; touch " FLAGFILE, 
			   substr($10, 3, 2), 
			   substr($10, 1, 2), 
			   substr($2, 1, 2), 
			   substr($2, 3, 2), 
			   "20" substr($10, 5, 2),
			   substr($2, 5, 2))); 
	    exit(0);
	}
    }
}
