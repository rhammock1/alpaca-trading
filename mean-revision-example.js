/*
 * This is a slightly modified example from https://github.com/alpacahq/alpaca-trade-api-js/blob/master/examples/mean-reversion.js
 */

require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');
const log = require('./log');
const CONFIG = require('./stock_config.json');

const {APCA_API_KEY_ID, APCA_API_SECRET_KEY, LOG_LEVEL} = process.env;
const USE_POLYGON = false;

class MeanRevision {
  constructor({keyId, secretKey, paper = true}) {
    this.alpaca = new Alpaca({
      keyId,
      secretKey,
      paper,
    });

    this.running_average = 0;
    this.last_order = null;
    this.time_to_close = null;

    // For example purposes
    this.stock = 'AAPL';
  }

  async run() {}

  awaitMarketOpen() {}

  async rebalance() {}

  async submitLimitOrder() {}

  async submitMarketOrder() {}
}

const meanRevisionExample = new MeanRevision({keyId: APCA_API_KEY_ID, secretKey: APCA_API_SECRET_KEY});
const run = () => {
  log('warn', 'Running Mean Revision Example');
  // meanRevisionExample.run();
};

const name = () => 'Mean Revision Example';

module.exports = {run, name};
