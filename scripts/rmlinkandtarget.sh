#!/bin/bash
# remove the target of a symlink *and* the link itself

rm -f "`readlink $1`"
rm -f "$1"
