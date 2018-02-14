#! /bin/bash
### BEGIN INIT INFO
# Provides:          hostnamesg
# Required-Start:    mountall
# Required-Stop:
# Should-Start:      glibc
# Default-Start:     S
# Default-Stop:
# Short-Description: Set hostname based on /etc/hostname
# Description:       Read the machines hostname from /etc/hostname, and
#                    update the kernel value with this value.  If
#                    /etc/hostname is empty, the current kernel value
#                    for hostname is used.  If the kernel value is
#                    empty, the value 'localhost' is used.
### END INIT INFO

PATH=/sbin:/bin:/usr/bin

. /lib/init/vars.sh
. /lib/lsb/init-functions

do_start () {
	RPI_ID=`cat /proc/cpuinfo | /bin/grep Serial | /bin/sed -e 's/.*: //; s/^........//;s/^\(....\)/\1====/'  | tr [:lower:] [:upper:]`
        REVISION=`cat /proc/cpuinfo | /bin/grep Revision | /bin/sed -e 's/.*: //'`
        ## get model from revision;
        ## see https://www.element14.com/community/community/raspberry-pi/blog/2016/11/21/how-to-identify-which-model-of-the-raspberry-pi-you-have
        case $REVISION in
            a01040|a01041|a21041|a22042)
                MODEL=RPI2
                ;;
            a02082|a22082)
                MODEL=RPI3
                ;;
            *)
                MODEL=RPI3
                ;;
        esac
	RPI_ID=${RPI_ID/====/$MODEL}
        echo $RPI_ID > /etc/rpi_id
        HOSTNAME="SG-${RPI_ID}"
        echo $HOSTNAME > /etc/hostname

	[ "$VERBOSE" != no ] && log_action_begin_msg "Setting hostname to '$HOSTNAME'"
	hostname "$HOSTNAME"
	ES=$?
	[ "$VERBOSE" != no ] && log_action_end_msg $ES
	exit $ES
}

do_status () {
	HOSTNAME=$(hostname)
	if [ "$HOSTNAME" ] ; then
		return 0
	else
		return 4
	fi
}

case "$1" in
  start|"")
	do_start
	;;
  restart|reload|force-reload)
	echo "Error: argument '$1' not supported" >&2
	exit 3
	;;
  stop)
	# No-op
	;;
  status)
	do_status
	exit $?
	;;
  *)
	echo "Usage: hostname.sh [start|stop]" >&2
	exit 3
	;;
esac

:
