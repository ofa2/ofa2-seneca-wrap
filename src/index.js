import _ from 'lodash';
import Promise from 'bluebird';

export function wrapAct() {
  if (!this.seneca) {
    throw new Error('no seneca found');
  }

  if (!global.Errors) {
    throw new Error('no global Errors found');
  }
  let act = Promise.promisify(this.seneca.act, { context: this.seneca });

  // expose global promise act
  global.act = async function actAsync(msg, ...args) {
    if (global.als) {
      let traceId = global.als.get('traceId');
      msg.traceId = msg.traceId === undefined ? traceId : msg.traceId;
    }

    return act(msg, ...args).then((result) => {
      if (result && result.errcode) {
        if (!Errors[result.errcode]) {
          return Promise.reject(new Error(`no error code found ${result.errcode}`));
        }

        return Promise.reject(new Errors[result.errcode]());
      }
      return result;
    });
  };
}

export function wrapRoutes() {
  if (!this.seneca) {
    throw new Error('no seneca found');
  }

  this.seneca.plainMsg = function plainMsg(msg) {
    return _.omit(msg, [
      'cmd',
      'action',
      'role',
      'transport$',
      'id$',
      'plugin$',
      'fatal$',
      'tx$',
      'meta$',
    ]);
  };

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

    controller[actionMethodName] = function actionAsync(msg, done) {
      let { traceId } = msg;
      if (traceId) {
        delete msg.traceId;
        if (global.als) {
          global.als.set('traceId', traceId);
        }
      }

      return actionMethod(msg)
        .then((result) => {
          return done(null, result);
        })
        .catch(Errors.OperationalError, (err) => {
          logger.warn(err);
          done(null, err.response());
        })
        .catch((err) => {
          logger.error(err);
          done(null, new Errors.InternalError().response());
        });
    };
  });
}
