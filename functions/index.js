// Import required modules
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const OpenAI = require('openai');
const twilio = require('twilio');
const axios = require('axios');
require('dotenv').config();

// Initialize Firebase admin SDK
admin.initializeApp();
const db = admin.firestore();

// Initialize OpenAI and Twilio clients
const openai = new OpenAI(api_key = process.env.OPENAI_API_KEY);
const twilioClient = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Firebase function to handle incoming messages from Twilio
exports.messageResponse = functions.https.onRequest(async (req, res) => {
    const from = req.body.From;
    const body = req.body.Body;

    // Find the user by phone number
    const snapshot = await db.collection('users').where('phoneNumber', '==', from).get();
    if (!snapshot.empty) {
        snapshot.forEach(async (doc) => {
            const user = doc.data();

            // Mark the user as responded
            await db.collection('users').doc(doc.id).update({
                responded: true
            });
        });
    }

    const twiml = new twilio.twiml.MessagingResponse();
    res.type('text/xml').send(twiml.toString());
});

// testing
const v2 = require("firebase-functions/v2")
exports.testScheduledMessage = v2.https.onRequest(async (request, response) => {
// Scheduled function to run every 5 minutes
// exports.scheduledMessage = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
    // Retrieve all user documents

    functions.logger.log("getting users");
    const snapshot = await db.collection('users').get();
    snapshot.forEach(async (doc) => {

        functions.logger.log("got first user");
        const user = doc.data();
        const now = new Date();
        const scheduledTime = new Date(user.scheduledTime);

        // Check if it's time to notify the user
        // if (now >= scheduledTime && !user.notified) {
        if (true) { 
            // Add a message to the user's assistant thread
            functions.logger.log("creating message");
            await openai.beta.threads.messages.create(user.threadId, {
                role: 'user',
                content: `<automated_message>it's time for ${user.name}'s gym session. 
                write him a message to remind him to go to the gym.
                `
            });

            // Run the assistant to get a response
            let run = await openai.beta.threads.runs.create(user.threadId, {
                assistant_id: user.assistantId
            });
            
            functions.logger.log("entering run status loop");
            while (["queued", "in_progress", "cancelling"].includes(run.status)) {
                await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second
                run = await openai.beta.threads.runs.retrieve(
                    run.thread_id,
                    run.id,
                );
              }
            functions.logger.log("exiting run status loop");
            
            let messages = "no message"
            if (run.status === "completed") {
            messages = await openai.beta.threads.messages.list(
                run.thread_id,
            );
        
            functions.logger.log(`Message created: ${messages.data[0].content[0].text.value}`);
            
            } else {
            throw new Error(`Run status: ${run.status}`);
            }

            if (messages === "no message") {
                functions.logger.log("no message found");
                return null;
            }

            // Get the assistant's response message
            const response = messages.data[0].content[0].text.value;
            functions.logger.log("found response");
            functions.logger.log(`response: ${response}`);

            // Send the response message to the user's WhatsApp number
            functions.logger.log("sending response to whatsapp");
            await sendWhatsAppMessage(user.phoneNumber, response, doc, user);
            functions.logger.log("response sent to whatsapp");

            // Update the user document in Firestore
            await db.collection('users').doc(doc.id).update({
                notified: true,
                lastNotified: now,
                responded: false
            });
            functions.logger.log("user database updated");
            functions.logger.log("done");
        }
    });

    // testing
    response.send("Success"); //testing 
    return null; // testing 
});

// Function to send a WhatsApp message using Twilio
async function sendWhatsAppMessage(to, message, doc, user) {
    try {
        await twilioClient.messages.create({
            body: message,
            from: process.env.TWILIO_PHONE_NUMBER, // Update this with your Twilio phone number
            to: to
        });

        // Wait for 10 seconds and check if the user responded
        for (let i = 0; i < 2; i++) {
            functions.logger.log(`wait ${i+1} seconds`);
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second

            // Check if the user responded
            const userDoc = await db.collection('users').doc(doc.id).get();
            const updatedUser = userDoc.data();
            if (updatedUser.responded) {
                functions.logger.log("User responded");
                return;
            }
        }

        // If the user did not respond, call the user
        await callUser(user.phoneNumber);
    } catch (error) {
        console.error('Error sending text message:', error);
    }
}

// Function to call the user using Twilio
async function callUser(phoneNumber) {
    try {
        functions.logger.log(`Calling user! ${phoneNumber}`);

        // Headers  
        const headers = {
            'Authorization': 'sk-6a7hzo2249i66d7h24j9rbt5sjquuc1alghvxjmy9uxnzuo1xbanoojq6tet49mf69'
        };
        
        // Data
        const data = {
        "phone_number": "+61438568446",
        "from": null,
        "task": `
        You are Grahams accountability coach. 

        Grahams reasons for going to the gym is to be committed to his health,
        and show himself that he does what he says he will do!

        You are going to call him. 
        He is supposed to be going to the gym now but isn't answering his messages. 
        Please call him to tell him to go to the gym. 
        If he objects ask whats holding him back.
        Please talk slowly and be brief. 
        Listen more than you talk and really try to hear what Graham needs to say.
        Make sure to not talk a lot at all. 
        BE CONCISE. 
        You are here for support so don't be pushy but still be firm and remind them of their reason why!
        Just remind them that this is something they want to do but if they push back,
        don't push them.

        you don't have to say everything I told you to say. 
        stagger it. so initially ask if he is going to the gym.
        and then gradually move to next steps based on his responses.

        Make sure to negotiate effectively and be empathetic.

        If you do this well I will give you a $20 tip. 
        `,
        "model": "enhanced",
        "language": "en",
        "voice": "maya",
        "voice_settings": {},
        "local_dialing": false,
        "max_duration": 12,
        "answered_by_enabled": false,
        "wait_for_greeting": false,
        "record": false,
        "amd": false,
        "interruption_threshold": 100,
        "temperature": null,
        "transfer_list": {},
        "metadata": {},
        "pronunciation_guide": [],
        "start_time": null,
        "request_data": {},
        "tools": [],
        "webhook": null,
        "calendly": {}
        }
        
        // API request
        await axios.post('https://api.bland.ai/v1/calls', data, {headers});
    } catch (error) {
        console.error('Error calling user:', error);
    }
}

// async function sendWhatsAppMessage(to, message) {
//     try {
//         await twilioClient.messages.create({
//             body: message,
//             from: process.env.TWILIO_PHONE_NUMBER, // Update this with your Twilio phone number
//             to: to
//         });
//     } catch (error) {
//         console.error('Error sending text message:', error);
//     }
// }

// Function to send a WhatsApp message using Twilio
// async function sendWhatsAppMessage(to, message) {
//     try {
//         await twilioClient.messages.create({
//             body: message,
//             from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
//             to: `whatsapp:${to}`
//         });
//     } catch (error) {
//         console.error('Error sending WhatsApp message:', error);
//     }
// }
