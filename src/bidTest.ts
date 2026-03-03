import axios from 'axios';
import WebSocket from 'ws';

const API_URL = 'http://localhost:3000/api';
const WS_URL = 'ws://localhost:3000/ws';

/** * 1. MOCK TOKENS
 * You need 3 separate users to test this properly.
 * A = Seller, B = First Bidder, C = Second Bidder
 */
const SELLER_A_COOKIE = 'auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjE5ZmNkY2I5LWFkM2ItNDFhMS1iOTU4LTNiZjVlZmUzYjg0ZSIsIm5hbWUiOiJhc2hpcyIsImVtYWlsIjoiYXNoaXNkdXR0YTc5NUBnbWFpbC5jb20ifQ.M6TrY18P_v2eTRMjK4WIJEyyQCnUKEBE0gNw3NKfkDw'; 
const BIDDER_B_COOKIE = 'auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImQ3MDhhMmE2LWFhNGQtNDE1MS1iOWJmLTJlMGZhOWI2OTBmMSIsIm5hbWUiOiJQdWphIiwiZW1haWwiOiJhc2hpc2R1dHRhMzEyQGdtYWlsLmNvbSJ9.5v1EQ7xBI95_JiAFnZOwoMsQ4l1Ou7J0HD6Vab2tjLc';
const BIDDER_C_COOKIE = 'auth_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImZjNzdjNmU5LTNiYTktNDQ5ZS1hMThiLTEzZTAxOTBlMGMxYiIsIm5hbWUiOiJpY2VjcmVhbSIsImVtYWlsIjoiYXNoaXNkdXR0ZG9jc0BnbWFpbC5jb20ifQ.rEMr0d8F4wakC7Ec9lAKjQOuLCYpmSuYa3KQvY9zTs8';

async function runBattleTest() {
    try {
        console.log("⚔️  Initializing Auction Battle...");

        // STEP 1: Create Auction (User A - The Seller)
        const now = new Date();
        const startTime = new Date(now.getTime() - 60000).toISOString(); // 1 min ago

        const createRes = await axios.post(`${API_URL}/auction/create`, {
            title: "Battle Item: miA3 phone",
            description: "Testing concurrency with simultaneous bidders.",
            photo: ["https://example.com/phonemiA3.jpg"],
            startPrice: 1000,
            durationHours: 1,
            startTime: startTime
        }, { headers: { Cookie: SELLER_A_COOKIE } });

        console.log("FULL RESPONSE DATA:", JSON.stringify(createRes.data, null, 2));
        const auctionId = createRes.data.auction.id;
        console.log(`✅ Auction Created by Seller A: ${auctionId}`);

        // STEP 2: Start the Auction (User A - Warm up Redis)
        await axios.post(`${API_URL}/auction/${auctionId}/start`, {}, { 
            headers: { Cookie: SELLER_A_COOKIE } 
        });
        console.log("🔥 Redis Warmed Up. Bidding is now OPEN.");

        // STEP 3: Setup WebSocket Listener (Connect as any user)
        const ws = new WebSocket(WS_URL);
        
        ws.on('open', () => {
            ws.send(JSON.stringify({ type: 'JOIN_AUCTION', auctionId }));
            console.log("🌐 WebSocket: Joined room, listening for broadcasts...");
        });

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === "NEW_BID") {
                console.log(`📢 LIVE BROADCAST: User ${msg.bidderId} bid $${msg.newPrice}`);
            } else if (msg.type === "AUCTION_ENDED") {
                console.log(`🏁 BROADCAST: Auction Closed. Winner: ${msg.winnerId}`);
            }
        });

        // Wait a second for WebSocket to establish connection
        await new Promise(r => setTimeout(r, 1000));

        // STEP 4: THE RACE (User B vs User C)
        console.log("🏃 User B and User C are sending bids at the same time...");
        
        // User B bids $2000
        const bidB = axios.post(`${API_URL}/auction/${auctionId}/bid`, 
            { amount: 6000 }, { headers: {Cookie: BIDDER_B_COOKIE } });

        // User C bids $2500
        const bidC = axios.post(`${API_URL}/auction/${auctionId}/bid`, 
            { amount: 5200 }, { headers: { Cookie: BIDDER_C_COOKIE } });

        // We use allSettled so the script doesn't crash if one bid fails (e.g., LOW_BID)
        const [resB, resC] = await Promise.allSettled([bidB, bidC]);

        console.log("\n--- Race Results ---");
        
        const formatResult = (res: any) => 
            res.status === 'fulfilled' ? "✅ SUCCESS" : `❌ FAILED: ${res.reason.response?.data?.error || res.reason.message}`;

        console.log("User B ($6000):", formatResult(resB));
        console.log("User C ($5200):", formatResult(resC));

        // Keep connection open for 3 seconds to see final WS logs
        setTimeout(() => {
            console.log("\n🏁 Test complete. Closing connection.");
            ws.close();
            process.exit(0);
        }, 3000);

    } catch (err: any) {
        console.error("❌ Critical Test Failure:", err.response?.data || err.message);
    }
}

runBattleTest();