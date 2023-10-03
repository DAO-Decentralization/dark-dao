#!/bin/bash
if [ -d "./data/geth" ]; then
    echo "Removing pre-existing geth directory..."
    rm -rf ./data/geth
fi
geth init --datadir ./data/ genesis.json
