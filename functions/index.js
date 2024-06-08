// Import required modules
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const OpenAI = require('openai');
const twilio = require('twilio');

// Initialize Firebase admin SDK
admin.initializeApp();
const db = admin.firestore();

// Initialize OpenAI and Twilio clients
const openai = new OpenAI(api_key = process.env.OPENAI_API_KEY);
const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Scheduled function to run every 5 minutes
exports.scheduledMessage = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    // Retrieve all user documents
    const snapshot = await db.collection('users').get();
    snapshot.forEach(async (doc) => {
        const user = doc.data();
        const now = new Date();
        const scheduledTime = new Date(user.scheduledTime);

        // Check if it's time to notify the user
        if (now >= scheduledTime && !user.notified) {
            // Add a message to the user's assistant thread
            await openai.beta.threads.messages.create(user.threadId, {
                role: 'user',
                content: `<automated_message>it's time for ${user.name}'s gym session. 
                write him a message to remind him to go to the gym.
                `
            });

            // Run the assistant to get a response
            const run = await openai.beta.threads.runs.create(user.threadId, {
                assistant_id: user.assistantId
            });

            // Get the assistant's response message
            const response = run.messages.find(message => message.role === 'assistant').content;

            // Send the response message to the user's WhatsApp number
            await sendWhatsAppMessage(user.phoneNumber, response);

            // Update the user document in Firestore
            await db.collection('users').doc(doc.id).update({
                notified: true,
                lastNotified: now,
                responded: false
            });
        }
    });
});

// Function to send a WhatsApp message using Twilio
async function sendWhatsAppMessage(to, message) {
    try {
        await twilioClient.messages.create({
            body: message,
            from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
            to: `whatsapp:${to}`
        });
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
    }
}
