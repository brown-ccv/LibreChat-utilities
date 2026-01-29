const mongoose = require('mongoose');

const actionSchema = new mongoose.Schema({}, { strict: false, collection: 'actions' });
const aclEntrySchema = new mongoose.Schema({}, { strict: false, collection: 'aclentries' });
const agentSchema = new mongoose.Schema({}, { strict: false, collection: 'agents' });
const assistantSchema = new mongoose.Schema({}, { strict: false, collection: 'assistants' });
const balanceSchema = new mongoose.Schema({}, { strict: false, collection: 'balances' });
const conversationtagSchema = new mongoose.Schema({}, { strict: false, collection: 'conversationtags' });
const keySchema = new mongoose.Schema({}, { strict: false, collection: 'keys' });
const memoryEntrySchema = new mongoose.Schema({}, { strict: false, collection: 'memoryentries' });
const pluginAuthSchema = new mongoose.Schema({}, { strict: false, collection: 'pluginauths' });
const promptGroupSchema = new mongoose.Schema({}, { strict: false, collection: 'promptgroups' });
const sharedLinkSchema = new mongoose.Schema({}, { strict: false, collection: 'sharedlinks' });
const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
const tokenSchema = new mongoose.Schema({}, { strict: false, collection: 'tokens' });
const sessionSchema = new mongoose.Schema({}, { strict: false, collection: 'sessions' });
const conversationSchema = new mongoose.Schema({}, { strict: false, collection: 'conversations' });
const messageSchema = new mongoose.Schema({}, { strict: false, collection: 'messages' });
const fileSchema = new mongoose.Schema({}, { strict: false, collection: 'files' });
const presetSchema = new mongoose.Schema({}, { strict: false, collection: 'presets' });
const promptSchema = new mongoose.Schema({}, { strict: false, collection: 'prompts' });
const transactionSchema = new mongoose.Schema({}, { strict: false, collection: 'transactions' });
const toolCallSchema = new mongoose.Schema({}, { strict: false, collection: 'toolcalls' });
const groupSchema = new mongoose.Schema({}, { strict: false, collection: 'groups' });

const Action = mongoose.model('Actions', actionSchema);
const AclEntry = mongoose.model('AclEntry', aclEntrySchema);
const Agent = mongoose.model('Agent', agentSchema);
const Assistant = mongoose.model('Assistant', assistantSchema);
const Balance = mongoose.model('Balance', balanceSchema);
const ConversationTag = mongoose.model('ConversationTag', conversationtagSchema);
const Key = mongoose.model('Key', keySchema);
const MemoryEntry = mongoose.model('MemoryEntry', memoryEntrySchema);
const PluginAuth = mongoose.model('PluginAuth', pluginAuthSchema);
const PromptGroup = mongoose.model('PromptGroup', promptGroupSchema);
const SharedLink = mongoose.model('SharedLink', sharedLinkSchema);
const User = mongoose.model('User', userSchema);
const Token = mongoose.model('Token', tokenSchema);
const Session = mongoose.model('Session', sessionSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);
const Message = mongoose.model('Message', messageSchema);
const File = mongoose.model('File', fileSchema);
const Preset = mongoose.model('Preset', presetSchema);
const Prompt = mongoose.model('Prompt', promptSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const ToolCall = mongoose.model('ToolCall', toolCallSchema);
const Group = mongoose.model('Group', groupSchema);

module.exports = {
  Action,
  AclEntry,
  Agent,
  Assistant,
  Balance,
  ConversationTag,
  Key,
  MemoryEntry,
  PluginAuth,
  PromptGroup,
  SharedLink,
  User,
  Token,
  Session,
  Conversation,
  Message,
  File,
  Preset,
  Prompt,
  Transaction,
  ToolCall,
  Group
};