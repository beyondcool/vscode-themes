#!/bin/bash

cd ..

npx @vscode/vsce package -o zhouhe-dark.vsix

code --install-extension zhouhe-dark.vsix --force
