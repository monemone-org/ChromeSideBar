# update-version.sh Readme

a script to upgrade Chrome extension build number. 

Version format: `{major}.{minor}.{build_number}` where build_number is the git commit count.

Commands:
- `./tools/update-version.sh` - Update build number only
- `./tools/update-version.sh minor` - Bump minor version
- `./tools/update-version.sh major` - Bump major version
- `./tools/update-version.sh 2 1` - Set specific major.minor

