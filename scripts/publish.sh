#!/bin/bash
set -e

yesNo () {
    while true; do
        read -p "$1 --> " choice
        case "$choice" in 
          y|Y|Yes|yes|YES ) ret_yesNo='y'; break;;
          n|N|No|no|NO ) ret_yesNo='n'; break;;
          * ) echo "invalid";;
        esac
    done        
}

for i in "$@"
do
    case $i in
        --no-build)
        BUILD=false
        shift
        ;;
        --no-test)
        TEST=false
        shift
        ;;
        *)
          UPGRADE_TYPE=$i
          shift
        ;;
    esac
done


if [ -n "$UPGRADE_TYPE" ]; then
    UPGRADE_TYPE=$1
else
    UPGRADE_TYPE=patch
fi

if [ "$(git rev-parse --abbrev-ref HEAD)" != "master" ]; then
    echo 'Error: Not on master.'
    exit 1
fi
if [ -n "$(git status -s)" ]; then
    echo 'Error: Uncommited stuff.'
    exit 1
fi
set -x
git pull origin master

set +x
# just checking
echo 
echo 
yesNo "Was the package built? (y/n)"
if [ $ret_yesNo != 'y' ]; then
    echo 'Error: package need to be built.'
    exit 1
fi
# yesNo "Was the package tested? (y/n)"
# if [ $ret_yesNo != 'y' ]; then
#     echo 'Error: package need to be tested.'
#     exit 1
# fi
yesNo "Was the package pushed to master? (y/n)"
if [ $ret_yesNo != 'y' ]; then
    echo 'Error: please push to master first.'
    exit 1
fi
echo 
echo 

set -x

TAG=$(npm version $UPGRADE_TYPE)
echo "Upgrading to version $TAG"
git commit -a --allow-empty -m $TAG
git push --tags origin master
git push -f origin master:published
npm publish
