/* eslint-disable no-useless-escape */
require('dotenv').config();
const readline = require('readline');
const log = require('./utils/log');
const longShortExample = require('./examples/long-short-example');
const meanRevisionExample = require('./examples/mean-revision-example');
const politicianTracker = require('./politician-tracking');
const cryptoTrader = require('./crypto');

const programs = {
  1: longShortExample,
  2: meanRevisionExample,
  3: politicianTracker,
  4: cryptoTrader,
};

const works_in_progress = {
  3: true,
  4: true,
};

/**
 * @description Validates the user's input and runs the selected example
 * @param {string} input_val 
 */
const validateInput = (input_val) => {
  if(programs[input_val]) {
    if(works_in_progress[input_val]) {
      log('warn', 'This program is a work in progress and is not ready for use.');
      process.exit(1);
    }
    log('info', `Running ${programs[input_val].name()}`);
    programs[input_val].run();
  } else {
    log('error', 'Invalid selection, please try again.');
    process.exit(1);
  }
};

/**
 * @description Lists the programs and returns a formatted string with them
 */
const enumerateExamples = () => {
  let string = '';
  for(const key of Object.keys(programs)) {
    string += `${key}. ${programs[key].name()}\n${
      key === Object.keys(programs)[Object.keys(programs).length - 1] ? '' : '  '}`;
  }
  return string;
};

/**
 * @description Prompts the user to select an example to run or runs the example specified in the command line
 * @param {string} [test_example]
 * @returns 
 */
const determineExample = async (test_example) => {
  if(test_example) {
    validateInput(test_example);
    return;
  }
  const rl = readline.createInterface({input: process.stdin, output: process.stderr});

  await rl.question(`Please select an example to run:\n  ${enumerateExamples()}> `, (answer) => {
    validateInput(answer);
  });
};

/**
 * @description Prints cool art
 */
const printArt = () => {
  console.log('\n\n\n');
  console.log('**************************************************************');
  console.log('**************************************************************');
  console.log('\n');
  console.log('    ****    **        ********    ****    ********    ****    ');
  console.log('  **    **  **        **    **  **    **  **        **    **  ');
  console.log('  ********  **        ********  ********  **        ********  ');
  console.log('  **    **  **        **        **    **  **        **    **  ');
  console.log('  **    **  **        **        **    **  **        **    **  ');
  console.log('  **    **  ********  **        **    **  ********  **    **  ');
  console.log('\n');
  console.log('       ********  ********    ****    ******    ********       ');
  console.log('          **     **    **  **    **  **    **  **             ');
  console.log('          **     ********  ********  **    **  ******         ');
  console.log('          **     ****      **    **  **    **  **             ');
  console.log('          **     **  **    **    **  **    **  **             ');
  console.log('          **     **    **  **    **  ******    ********       ');
  console.log('\n');
  console.log('**************************************************************');
  console.log('**************************************************************');
  console.log('\n\n\n');
};

/**
 * @description Prints the help message
 */
const helpMessage = () => {
  log('warn', 'Usage: node index.js [optional example number]');
  log('warn', 'Example numbers:', '\n ', enumerateExamples());
  log('warn', 'If no example number is provided, you will be prompted to select one.');
  log('warn', 'Please configure a config.json file in the root directory before running any programs.');
};

/**
 * @description Runs the program
 */
const run = () => {
  printArt();

  if(process.argv[2] === '--help' || process.argv[2] === '-h') {
    helpMessage();
    process.exit(0);
  }

  log('info', 'The environment is: ', process.env.NODE_ENV);
  log('info', 'Thank you for testing.');
  // Present with options to select which example to run
  determineExample(process.argv[2]);
};

run();

