#!/bin/bash
# Usage: ./save.sh "what I changed"
git add .                      # stage all changes
git commit -m "${1:-Update}"   # commit (message defaults to "Update")
git push                       # upload to GitHub
