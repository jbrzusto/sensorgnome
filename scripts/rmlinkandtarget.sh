#!/bin/bash
# remove the target of a symlink *and* the link itself
# if they don't exist, set
if [[ -L "$1" ]]; then
    rm -f "`readlink $1`"
    rm -f "$1"
    exit 0;
else
    exit 1;
fi
