import ws from 'k6/ws';
import http from 'k6/http';
import { check } from 'k6';

export const options = {
    stages: [
        { duration: '5s',  target: 100 }, 
        { duration: '50s', target: 100 }, 
        { duration: '5s',  target: 0 },   
    ],
    };

    const testStartTime = Date.now();

    export default function () {
    const targetAuctionId = 'a72f9eac-46c3-4d6b-91c9-bbed2b0521e7'; 
    const wsUrl = 'ws://localhost:3000/ws';
    const httpBidUrl = `http://localhost:3000/api/auction/${targetAuctionId}/bid`; 

    const httpParams = {
        headers: {
        'Content-Type': 'application/json',
        'x-load-test-token': 'super-secret-k6-token'
        },
    };

    ws.connect(wsUrl, { headers: { 'x-load-test-token': 'super-secret-k6-token' } }, function (socket) {
        socket.on('open', () => {
        socket.send(JSON.stringify({ type: 'JOIN_AUCTION', auctionId: targetAuctionId }));

        socket.setInterval(() => {
            const timePassed = Date.now() - testStartTime;
            const rand = Math.random(); 
            let amountToBid;
            let bidCategory = '';

            if (rand < 0.70) {
                // 70% CHANCE: Valid, incremental bid (32-bit safe)
                amountToBid = 1000000 + (timePassed * 100) + __VU;
                bidCategory = 'valid';
            } else if (rand < 0.90) {
                // 20% CHANCE: Lowball bid (Simulating lag or bad input)
                amountToBid = 10;
                bidCategory = 'invalid';
            } else {
                // 10% CHANCE: Sniper collision (NO __VU added, so bots tie exactly)
                amountToBid = 5000000 + (Math.floor(timePassed / 1000) * 10000);
                bidCategory = 'invalid';
            }
            
            const payload = JSON.stringify({ amount: amountToBid });
            const postRes = http.post(httpBidUrl, payload, httpParams);

            if (bidCategory === 'valid') {
                check(postRes, { '✅ Valid Bid Accepted (200)': (r) => r.status === 200 });
            } else {
                check(postRes, { '🛡️ Bad/Tie Bid Blocked (400+)': (r) => r.status >= 400 });
            }

        }, 300); // Kept at 300ms so you still get ~20,000 total requests
        });

        socket.setTimeout(() => socket.close(), 70000);
    });
}