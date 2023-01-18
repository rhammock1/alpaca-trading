require('dotenv').config();
const Alpaca = require('@alpacahq/alpaca-trade-api');
const log = require('../utils/log');
const {
  awaitMarketOpen,
  cancelExistingOrders,
  getMarketClose,
} = require('../utils');
const CONFIG = require('../stock_config.json');

const {APCA_API_KEY_ID, APCA_API_SECRET_KEY, NODE_ENV} = process.env;
const USE_POLYGON = false;

const MINUTE = 60000;

class PoliticianTracker {
  constructor({keyId, secretKey, paper = true}) {
    this.alpaca = new Alpaca({
      keyId,
      secretKey,
      paper,
      usePolygon: USE_POLYGON,
    });

    if(!CONFIG?.politicians?.length) {
      log('error', 'Please create a "./stock_config.json" file and insert an array of stock symbols to continue.');
      return;
    }

    this.some_value = 0;
  }
}

const run = async () => {
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
