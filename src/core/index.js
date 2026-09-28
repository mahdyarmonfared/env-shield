/**
 * EnvShield Core API entry point
 */

const envParser = require('./env-parser');
const typeInfer = require('./type-infer');
const securityAuditor = require('./security-auditor');
const comparator = require('./comparator');
const syncer = require('./syncer');
const generator = require('./generator');

module.exports = {
  ...envParser,
  ...typeInfer,
  ...securityAuditor,
  ...comparator,
  ...syncer,
  ...generator
};
