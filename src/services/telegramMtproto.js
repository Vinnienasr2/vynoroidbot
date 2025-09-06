const MTProto = require('@mtproto/core');
const readline = require('readline');

const api_id = 19129421;
const api_hash = 'b763427428939fb58db937849c7b05f5';

const path = require('path');
const mtproto = new MTProto({
  api_id,
  api_hash,
  storageOptions: {
    path: path.resolve(__dirname, '../../telegram-session.json'),
  },
});

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

const fs = require('fs');
async function login() {
  const sessionPath = path.resolve(__dirname, '../../telegram-session.json');
  let sessionExists = false;
  try {
    sessionExists = fs.existsSync(sessionPath) && fs.readFileSync(sessionPath, 'utf8').length > 0;
  } catch (err) {
    sessionExists = false;
  }
  if (sessionExists) {
    // Try a simple API call to check if session is valid
    try {
      await mtproto.call('users.getFullUser', { id: { _: 'inputUserSelf' } });
      console.log('Telegram session loaded. No login required.');
      return;
    } catch (err) {
      console.warn('Session file exists but is invalid or expired. Re-authenticating...');
    }
  }
  // If no valid session, prompt for login
  try {
    const phone_number = await prompt('Enter your phone number: ');
    if (!/^\+?\d{10,15}$/.test(phone_number)) {
      console.error('Invalid phone number format. Please use international format, e.g. +254XXXXXXXXX or 254XXXXXXXXX');
      return;
    }
    let sendCodeResult;
    try {
      sendCodeResult = await mtproto.call('auth.sendCode', {
        phone_number,
        settings: { _: 'codeSettings' }
      });
    } catch (err) {
      // Handle PHONE_MIGRATE_X error
      if (err.error_message && err.error_message.startsWith('PHONE_MIGRATE_')) {
        const dcId = parseInt(err.error_message.split('_')[2], 10);
        console.warn(`Phone number registered on DC ${dcId}. Retrying on correct DC...`);
        mtproto.setDefaultDc(dcId);
        try {
          sendCodeResult = await mtproto.call('auth.sendCode', {
            phone_number,
            settings: { _: 'codeSettings' }
          });
        } catch (err2) {
          console.error('Error sending code after DC migration:', err2.message || err2);
          return;
        }
      } else {
        console.error('Error sending code:', err.message || err);
        return;
      }
    }
    const code = await prompt('Enter the code you received: ');
    try {
      await mtproto.call('auth.signIn', {
        phone_number,
        phone_code_hash: sendCodeResult.phone_code_hash,
        phone_code: code
      });
      console.log('Telegram user authenticated!');
    } catch (err) {
      console.error('Error signing in:', err.message || err);
    }
  } catch (err) {
    console.error('Unexpected error during login:', err.message || err);
  }
}

// Accepts either channel username (public) or channel ID (private)
async function getChannelMedia(channelIdentifier, limit = 50) {
  let channel;
  if (typeof channelIdentifier === 'string' && channelIdentifier.startsWith('@')) {
    // Public channel by username
    const { chats } = await mtproto.call('messages.getChats', {
      id: []
    });
    channel = chats.find(c => c.username === channelIdentifier.replace('@', ''));
    if (!channel) throw new Error('Channel not found or not joined');
  } else {
    // Private channel by ID
    // Get all joined channels and find by ID
    const { chats } = await mtproto.call('messages.getAllChats', { except_ids: [] });
    channel = chats.find(c => c.id === channelIdentifier);
    if (!channel) throw new Error('Private channel not found or not joined');
  }
  // Fetch messages
  const history = await mtproto.call('messages.getHistory', {
    peer: { _: 'inputPeerChannel', channel_id: channel.id, access_hash: channel.access_hash },
    limit
  });
  if (!history.messages || history.messages.length === 0) {
    return [];
  }
  // Filter media messages
  const media = history.messages
    .filter(m => m.media && (m.media.document || m.media.photo || m.media.video))
    .map(m => {
      let file_id = null, media_type = 'other';
      if (m.media.document) {
        file_id = m.media.document.id;
        media_type = 'document';
      } else if (m.media.photo) {
        file_id = m.media.photo.id;
        media_type = 'photo';
      } else if (m.media.video) {
        file_id = m.media.video.id;
        media_type = 'video';
      }
      return {
        file_id,
        caption: m.message,
        media_type,
        message_id: m.id
      };
    })
    .filter(f => f.file_id);
  return media;
}

module.exports = { login, getChannelMedia };
