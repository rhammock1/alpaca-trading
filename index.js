/* eslint-disable no-useless-escape */
require('dotenv').config();
const readline = require('readline');
const log = require('./utils/log');
const longShortExample = require('./examples/long-short-example');
const meanRevisionExample = require('./examples/mean-revision-example');

const examples = {
  1: longShortExample,
  2: meanRevisionExample,
};

/**
 * @description Validates the user's input and runs the selected example
 * @param {string} input_val 
 */
const validateInput = (input_val) => {
  if(examples[input_val]) {
    log('info', `Running ${examples[input_val].name()}`);
    examples[input_val].run();
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
  for(const key of Object.keys(examples)) {
    string += `${key}. ${examples[key].name()}\n${
      key === Object.keys(examples)[Object.keys(examples).length - 1] ? '' : '  '}`;
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

  await rl.question(`Please select an example to run:\n  ${enumerateExamples()}>`, (answer) => {
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
  log('warn', 'Please configure a config.json file in the root directory before running any examples.');
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

