#!/usr/bin/perl -w
#
# get gps fixes
#
# params:
#  zScoreThreshold
#  nfixmin

# Read stdin, looking for $GPGGA messages. When the current fix
# differs from the previous fix by at least zScoreThreshold SD in lat, long, or
# altitude, record the fix and mark it as the previous one.
# A fix estimate is only treated as good once it is the mean of nfixmin fixes.

use strict;
use POSIX "strftime";

my $latQ = 0;
my $latmean = 0;
my $lonQ = 0;
my $lonmean = 0;
my $elevQ = 0;
my $elevmean = 0;
my $latsd = 0;
my $lonsd = 0;
my $elevsd = 0;
my $nfix = 0;

my $zScoreThreshold = $ARGV[0];
my $nFixMin = $ARGV[1];
my $needinitialfix = 1;

# set command-wise output buffering
$|=1;

while (<STDIN>) {
  if ($_ =~ /^\$GPGGA/) {
    my @fields = split ",";
    my $lat = $fields[2];
    $lat = -$lat if ($fields[3] ne "N");
    ## convert DEG+MIN to decimal DEG
    $lat = int($lat/100) + ($lat / 100 - int($lat / 100)) / 0.6;
    my $lon = 0 + $fields[4];
    $lon = -$lon if($fields[5] ne "E");
    $lon = int($lon/100) + ($lon / 100 - int($lon / 100)) / 0.6;
    my $elev= 0 + $fields[9];
    if ($needinitialfix 
	|| ($nfix >= $nFixMin && (
		($latsd  > 0 && abs($lat  - $latmean)  > $zScoreThreshold * $latsd)
		||($lonsd  > 0 && abs($lon  - $lonmean)  > $zScoreThreshold * $lonsd)
		||($elevsd > 0 && abs($elev - $elevmean) > $zScoreThreshold * $elevsd)))) {
      printf "%d,%.6f,%.6f,%.3f\n", strftime("%s",gmtime), $lat, $lon, $elev;
      $nfix = $latQ = $lonQ = $elevQ = $latmean = $lonmean = $elevmean = 0;
      $needinitialfix = 0;
    }
    ++$nfix;
    $latQ += ($nfix - 1) / $nfix * ($lat - $latmean)**2;
    $latmean += ($lat - $latmean) / $nfix;
    $lonQ += ($nfix - 1) / $nfix * ($lon - $lonmean)**2;
    $lonmean += ($lon - $lonmean) / $nfix;
    $elevQ += ($nfix - 1) / $nfix * ($elev - $elevmean)**2;
    $elevmean += ($elev - $elevmean) / $nfix;
    if ($nfix > 1) {
      $latsd = sqrt($latQ / ($nfix - 1));
      $lonsd = sqrt($lonQ / ($nfix - 1));
      $elevsd = sqrt($elevQ / ($nfix - 1));
    }
  }
}

