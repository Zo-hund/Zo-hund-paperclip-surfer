const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({});
ai.live.connect({ model: 'models/gemini-2.0-flash-exp' }).then(s => {
  console.log('Connected to 2.0-flash-exp!');
  s.close();
}).catch(e => {
  console.error('Failed 2.0-flash-exp:', e.message);
});

ai.live.connect({ model: 'models/gemini-3.1-flash-live-preview' }).then(s => {
  console.log('Connected to 3.1-flash!');
  s.close();
}).catch(e => {
  console.error('Failed 3.1-flash:', e.message);
});
