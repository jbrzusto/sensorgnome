#!/usr/bin/awk -f
#
# This script translates USB paths into USB HUB port numbers.
#
# This script must be called with parameter %p from udev .rules files
#
# This script assumes there is a file called /dev/usb_hub_port_nums.txt
# which has a list of PATH PORT pairs, where PATH is a kernel device path
# as supplied by %p, and port is a port number from 1 up.  PATH and PORT
# must be separated by whitespace.

BEGIN {
    devpath = ARGV[1];
## DEBUGGING:    printf "Trying to get PORT_NUM for %s\n", devpath >> "/tmp/rules.txt";

    port_name_file = "/dev/usb_hub_port_nums.txt";
    port_number = "internal";
    while (0 < getline x < port_name_file) {
        split(x, A);
        if (substr(devpath, 1, length(A[1])) == A[1]) {
            port_number = A[2];
            break;
        }
    }
    printf "PORT_NUM=%d\n", port_number;
## DEBUGGING:    printf "Got PORT_NUM=%d for %s\n", port_number, devpath >> "/tmp/rules.txt";
}
