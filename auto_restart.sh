#!/bin/bash

while true
do
  echo "Reiniciando o bot..."
  pkill -f "node"  # mata qualquer processo node
  sleep 2
  node /opt/leobez_workspace/Community-BOT/index.js  # <-- substitui 'index.js' se o nome for outro
  echo "Aguardando 10 minutos para reiniciar..."
  sleep 600
done


