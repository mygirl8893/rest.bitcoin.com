let express = require('express');
let router = express.Router();
let axios = require('axios');
let RateLimit = require('express-rate-limit');

let BITBOXCli = require('bitbox-cli/lib/bitbox-cli').default;
let BITBOX = new BITBOXCli();

let config = {
  transactionRateLimit1: undefined,
  transactionRateLimit2: undefined
};

let processInputs = tx => {
  if (tx.vin) {
    tx.vin.forEach((vin) => {
      if(!vin.coinbase) {
        let address = vin.addr;
        vin.legacyAddress = BITBOX.Address.toLegacyAddress(address);
        vin.cashAddress = BITBOX.Address.toCashAddress(address);
        vin.value = vin.valueSat;
        delete vin.addr;
        delete vin.valueSat;
        delete vin.doubleSpentTxID;
      }
    });
  }
};

let i = 1;
while(i < 6) {
  config[`transactionRateLimit${i}`] = new RateLimit({
    windowMs: 60000, // 1 hour window
    delayMs: 0, // disable delaying - full speed until the max limit is reached
    max: 60, // start blocking after 60 requests
    handler: function (req, res, /*next*/) {
      res.format({
        json: function () {
          res.status(500).json({ error: 'Too many requests. Limits are 60 requests per minute.' });
        }
      });
    }
  });
  i++;
}

router.get('/', config.transactionRateLimit1, (req, res, next) => {
  res.json({ status: 'transaction' });
});

router.get('/details/:txid', config.transactionRateLimit1, (req, res, next) => {
  try {
    let txs = JSON.parse(req.params.txid);
    if(txs.length > 20) {
      res.json({
        error: 'Array too large. Max 20 txids'
      });
    }

    let result = [];
    txs = txs.map((tx) => {
      return axios.get(`${process.env.BITCOINCOM_BASEURL}tx/${tx}`)
    })
    axios.all(txs)
    .then(axios.spread((...args) => {
      for (let i = 0; i < args.length; i++) {
        let parsed = args[i].data;
        result.push(parsed);
      }
      result.forEach((tx) => {
        processInputs(tx);
      });
      res.json(result);
    }));
  }
  catch(error) {
    axios.get(`${process.env.BITCOINCOM_BASEURL}tx/${req.params.txid}`)
    .then((response) => {
      let parsed = response.data;
      if(parsed) {
        processInputs(parsed);
      }
      res.json(parsed);
    })
    .catch((error) => {
      res.send(error.response.data.error.message);
    });
  }
});

module.exports = router;
