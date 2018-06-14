'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var _ = _interopDefault(require('lodash'));
var Promise = _interopDefault(require('bluebird'));

function plainMsg(msg) {
  return _.omit(msg, ['cmd', 'action', 'role', 'transport$', 'id$', 'plugin$', 'fatal$', 'tx$', 'meta$', 'traceId']);
}

function logRequest(type, level, msg) {
  if (type === true) {
    logger[level](msg.cmd);
  } else if (type === 'all') {
    logger[level](msg);
  } else if (type === 'plain') {
    logger[level](msg.cmd, plainMsg(msg));
  }
}

function logResponse(start, type, level, msg, result) {
  let ms = Date.now() - start;

  if (result instanceof Errors.OperationalError) {
    result.seneca = plainMsg(msg);
    result.seneca.cmd = msg.cmd;
    result.seneca.costMs = ms;
    logger.warn(result);
  } else if (result instanceof Error) {
    result.seneca = msg;
    result.seneca.costMs = ms;
    logger.error(result);
  } else if (type === true) {
    logger[level](`done ${msg.cmd} -- ${ms}ms`);
  } else if (type === 'plain') {
    logger[level](`done ${msg.cmd} -- ${ms}ms`, result);
  }
}

function wrapAct() {
  if (!this.seneca) {
    throw new Error('no seneca found');
  }

  if (!global.Errors) {
    throw new Error('no global Errors found');
  }

  let act = Promise.promisify(this.seneca.act, {
    context: this.seneca
  }); // expose global promise act

  global.act = async function actAsync(msg, ...args) {
    if (global.als) {
      let traceId = global.als.get('traceId');
      msg.traceId = msg.traceId === undefined ? traceId : msg.traceId;
    }

    let result = await act(msg, ...args);

    if (result && result.errcode) {
      if (!Errors[result.errcode]) {
        throw new Error(`no error name found ${result.errcode} for ${result.errmsg}`);
      }

      throw new Errors[result.errcode](result.extra);
    }

    return result;
  };
}
function wrapRoutes() {
  if (!this.seneca) {
    throw new Error('no seneca found');
  }

  this.seneca.plainMsg = plainMsg;

  _.forEach(this.config.routes, (action, key) => {
    let index = key.indexOf(' ');
    let keyParts = [key.slice(0, index), key.slice(index + 1)];
    let method = (keyParts[0] || '').toLowerCase();

    if (!_.includes(['add', 'wrap'], method)) {
      throw new Error(`invalid route method: ${method}`);
    }

    let actionParts = action.split('.');
    let controllerName = actionParts[0];
    let controller = this.controllers[controllerName];

    if (!controller) {
      throw new Error(`undefined controller: ${controllerName}`);
    }

    let actionMethodName = actionParts[1];
    let actionMethod = controller[actionMethodName].bind(controller);

    if (!actionMethod) {
      throw new Error(`undefined action method: ${action}`);
    }

    let {
      requestLog,
      requestLogLevel = 'trace'
    } = this.config.seneca;
    let {
      responseLog,
      responseLogLevel = 'trace'
    } = this.config.seneca;

    controller[actionMethodName] = function actionAsync(msg, done) {
      let {
        traceId
      } = msg;

      if (traceId) {
        if (global.als) {
          global.als.set('traceId', traceId);
        }
      }

      const start = Date.now();
      logRequest(requestLog, requestLogLevel, msg);
      return Promise.resolve().then(() => {
        return actionMethod(msg);
      }).then(result => {
        logResponse(start, responseLog, responseLogLevel, msg, result);
        return done(null, result);
      }).catch(Errors.OperationalError, err => {
        logResponse(start, responseLog, responseLogLevel, msg, err);
        done(null, err.response());
      }).catch(err => {
        logResponse(start, responseLog, responseLogLevel, msg, err);
        done(null, new Errors.Unknown().response());
      });
    };
  });
}

exports.wrapAct = wrapAct;
exports.wrapRoutes = wrapRoutes;
//# sourceMappingURL=bundle.cjs.js.map
