require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');
const log = require('../utils/log');
const {
  awaitMarketOpen,
  cancelExistingOrders,
  spin,
} = require('../utils');
const CONFIG = require('../stock_config.json');

const {APCA_API_KEY_ID, APCA_API_SECRET_KEY, NODE_ENV} = process.env;
const USE_POLYGON = false;

class PoliticianTracker {
  constructor({keyId, secretKey, paper = true}) {
    this.alpaca = new Alpaca({
      keyId,
      secretKey,
      paper,
      usePolygon: USE_POLYGON,
    });

    this.time_to_close = null;
    this.politicians = CONFIG.politicians;
  }

  async run() {
    // First, cancel any existing orders so they don't impact our buying power
    await cancelExistingOrders();

    // Wait for the market to open
    log('info', 'Waiting for market to open.');
    this.time_to_close = await awaitMarketOpen(this.time_to_close);
    log('info', 'Market opened.');

    await spin(this.run.bind(this), this.rebalance.bind(this));
  }
}

const run = async () => {
  if(!CONFIG?.politicians?.length) {
    log('error', 'Please create a "./stock_config.json" file and insert an array of politicians to continue.');
    return;
  }
  const politicianTracker = new PoliticianTracker({
    keyId: APCA_API_KEY_ID,
    secretKey: APCA_API_SECRET_KEY,
    paper: NODE_ENV === 'development',
  });
  log('info', 'Tracking stock trades made by politicians');
  politicianTracker.run();
};

const name = () => 'Politician Tracker';

module.exports = {run, name};
