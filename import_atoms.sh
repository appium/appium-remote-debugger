#!/bin/bash
set -e

usage() {
    echo ""
    echo "Usage:"
    echo "    import_atoms.sh <PATH_TO_SELENIUM_REPO>"
    echo ""
}

if [[ $# -lt 1 ]]
then
    usage
    exit
fi

################################################################################

SELENIUM_REPO_PATH=$1
DESTINATION_DIRECTORY=$2
LASTUPDATE_FILE="$DESTINATION_DIRECTORY/lastupdate"
ATOMS_BUILD_DIR="$PWD/atoms_build_dir"
TEMP_BUILD_DIR_NAME="appium-atoms-driver"
TEMP_ATOMS_BUILD_DIR_SYMLINK="$SELENIUM_REPO_PATH/javascript/$TEMP_BUILD_DIR_NAME"
ATOMS_BUILD_TARGET="build_atoms"

# 1. Inject build file into CrazyFunBuild used by Selenium
cp -R "$ATOMS_BUILD_DIR" "$TEMP_ATOMS_BUILD_DIR_SYMLINK"

# 2. Build the JS Fragments
pushd "$SELENIUM_REPO_PATH"
# Build all the Atoms
./go //javascript/$TEMP_BUILD_DIR_NAME:$ATOMS_BUILD_TARGET

# 3. Import the atoms we need
# Before importing, delete the previous atoms
rm -rf "${DESTINATION_DIRECTORY:?}/*"

# Import only the Atoms JavaScript files
JS_LIST="./build/javascript/atoms/fragments/*.js ./build/javascript/webdriver/atoms/fragments/inject/*.js ./build/javascript/appium-atoms-driver/*.js"
for JS in $JS_LIST
do
    if [[ $JS != *_exports.js ]] && [[ $JS != *_ie.js ]] && [[ $JS != *build_atoms.js ]] && [[ $JS != *deps.js ]]
    then
        if [ -e "$JS" ]
        then
            echo "Importing Atom: $JS"
            cp "$JS" "$DESTINATION_DIRECTORY"
        else
            echo "Source does not exist: $JS"
        fi
    fi
done

# 4. Save the current timestamp to remember when this was generated
date +"%Y-%m-%d %H:%M:%S" > "$LASTUPDATE_FILE"
echo "" >> "$LASTUPDATE_FILE"
git log -n 1 --decorate=full >> "$LASTUPDATE_FILE"

popd

# 5. Clear build files from CrazyFunBuild and clear the "/build" directory
# rm -rf "${TEMP_ATOMS_BUILD_DIR_SYMLINK:?}"
# rm -rf "${SELENIUM_REPO_PATH:?}/build"
