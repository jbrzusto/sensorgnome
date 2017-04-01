#!/usr/bin/perl -w
#
# echo a JSON object representing connected devices
#

use strict;
use JSON;

my %hub_devs;

# usb hub devices are linked in /dev/bonedongle with names like these:
# disk.port=7.name=sda1.mount=disk_port7-1
# funcubeProPlus.port=2.alsaDev=0.usbPath=1:4
# funcubeProPlus.port=3.alsaDev=1.usbPath=1:6
# gps.port=1.pps=0

my @devlist=`cd /dev/bonedongle; ls -1`;
chomp @devlist;

foreach my $dev (@devlist) {
    my @parts = split(/\./, $dev);
    my $devname = shift @parts;
    my %attrs;
    foreach my $part (@parts) {
        my ($pname, $pval) = split(/=/, $part);
        $attrs{$pname} = $pval;
    }
    if ($devname =~ /funcube.*/) {
        chomp (my $freq=`fcd -p $attrs{usbPath} -g`);
        $freq = ($freq / 1000000.0) . " MHz";
        $hub_devs{$attrs{port}} = {( name => $devname, type => "fcd", alsa_dev => $attrs{alsaDev}, frequency => $freq)};
    } elsif ($devname =~ /rtlsdr.*/) {
        $hub_devs{$attrs{port}} = {( name => $devname, type => "rtlsdr", mfg => $attrs{mfg}, prod => $attrs{prod}, vidpid => $attrs{vidpid}, frequency => "TODO")};
    } elsif ($devname =~ /usbAudio/) {
        my @info=`cat /proc/asound/card$attrs{alsaDev}/stream0`;
        my ($fullname) = split(/ at usb-musb/, $info[0]);
        $hub_devs{$attrs{port}} = {( name => $fullname, type => "usbAudio", alsa_dev => $attrs{alsaDev})};
    } elsif ($devname =~ /disk/) {
        chomp(my $usage = `df /media/$attrs{mount} | tail -1l`);
        my ($SKIP,$size,$used,$avail,$used_percent) = split(/[ \t]+/, $usage);

        # get label, uuid, type
        chomp(my @blkid = `/sbin/blkid -o value /dev/$attrs{name}`);

        # get size and free space
        my $this_disk  = {( name => $blkid[0], "uuid" =>  $blkid[1], filesystem =>  $blkid[2],
                            size => $size, used=>$used, avail => $avail, used_percent => $used_percent )};

        if ($hub_devs{$attrs{port}}) {
            push ($hub_devs{$attrs{port}}{"partitions"}, $this_disk);
        } else {
            $hub_devs{$attrs{port}} = {( type=> "disk", partitions => [( $this_disk)] )};
        }
    } elsif ($devname =~ /gps/) {
        if ("$attrs{type}" eq "cape") {
            $hub_devs{"-1"} = {( name=> "Adafruit GPS hat with PPS", type => "gps")};
        } else {
            $hub_devs{$attrs{port}} = {( name=> "USB GPS receiver" . ($attrs{pps} ? " with PPS" : ""), type => "gps")};
        }
    }
}

# internal: stuff about the beaglebone

chomp(my $usage = `df /media/internal_SD_card | tail -1l`);
my ($SKIP,$size,$used,$avail,$used_percent) = split(/[ \t]+/, $usage);

$hub_devs{"internal_SD"} = {(name => "internal_SD_card", filesystem => "ext4", size=>$size, used=>$used, avail=>$avail, used_percent => $used_percent)};

print( to_json(\ %hub_devs) . "\n");
