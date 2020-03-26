import connect from './connect';
import events from './events';
import execute from './execute';
import navigate from './navigate';
import messageHandlers from './message-handlers';


const mixins = Object.assign({},
  connect, events, execute, navigate, messageHandlers
);


export { mixins, events };
export default mixins;
