# Websocketer

## JSON RPC Websocket to TCP bridge

    # NodeJS
    sudo apt update -y
    sudo apt install curl -y
    curl -sL https://deb.nodesource.com/setup_10.x | sudo bash -
    sudo apt install -y nodejs

    # Forever Service
    sudo npm install -y forever -g
    sudo npm install -y forever-service -g

    # Yarn
    curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
    echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
    sudo apt-get update && sudo apt-get install yarn

## Install dependencies

    yarn

## Build

    npm run build

## Launch API server

    node lib/indexWebsocketer.js

## Launch server using `forever-service`

    sudo forever-service install websocketer -r root --script lib/indexWebsocketer.js  --start

## Restart, stop, delete service

    sudo service websocketer restart
    sudo service websocketer stop
    sudo forever-service delete websocketer

