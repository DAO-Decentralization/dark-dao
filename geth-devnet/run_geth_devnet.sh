#!/bin/bash
geth --datadir data --networkid 30121 --netrestrict 127.0.0.1/24 --nodiscover --unlock 0x359eeb0c3266007b1975ca7a399b6fbab1122824 --mine --miner.etherbase 0x359eeb0c3266007b1975ca7a399b6fbab1122824 --http --http.api eth,debug --allow-insecure-unlock --password password.txt --http.port 23545
