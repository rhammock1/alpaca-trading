require('dotenv').config();
const {LOG_LEVEL} = process.env;

const log_levels = {
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

const log = (level, ...args) => {
  const actual_args = args.map((a) => {
    if(Array.isArray(a)) {
      return `[${a.join(', ')}]`;
    } else if(typeof a === 'object') {
      let string = '{';
      for(const key of Object.keys(a)) {
        string += `${key}: ${a[key]}${key === Object.keys(a)[Object.keys(a).length - 1] ? '' : ', '}`;
      }
      string += '}';
      return string;
    } else {
      return a;
    }
  });
  if(log_levels[LOG_LEVEL] >= log_levels[level]) {
    console.log(level, ...actual_args);
  }
};

module.exports = log;
