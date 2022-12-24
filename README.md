## Alpaca Trading

This will hold various provided examples and my own implementations of trading strategies.

[Alpaca Documentation](https://alpaca.markets/docs/)

[Alpaca JS API GitHub](https://github.com/alpacahq/alpaca-trade-api-js)

### Getting started
```
  git clone https://github.com/rhammock1/alpaca-trading.git
  cd alpaca-trading
  npm i

  echo "NODE_ENV=development\nLOG_LEVEL=debug\nAPCA_API_KEY_ID=YOUR_API_KEY\nAPCA_API_SECRET_KEY=YOUR_API_SECRET" >> .env
```

### Running the strategies
```
  node index.js
```
You will be prompted with a list of examples to run. Select the number of the example you want to run.

If you already know the strategy number, you can select the strategy number from the command line instead:
```
  node index.js 1
```

### Currently implemented strategies:
1. Long Short (example provided by Alpaca Docs)
2. Mean Revision (example provided by Alpaca Docs)
