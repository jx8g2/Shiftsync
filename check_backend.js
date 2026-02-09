const http = require('http');

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3001,
            path: '/api' + path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function test() {
    try {
        console.log('Fetching requests...');
        const res = await request('GET', '/requests');
        console.log('GET response success:', res.success);

        if (!res.requests || res.requests.length === 0) {
            console.log('No requests found.');
            // Create one?
            console.log('Creating dummy request...');
            const createRes = await request('POST', '/requests', {
                employeeId: 1, // Assumes ID 1 exists (manager or admin)
                startDate: '2026-03-01',
                endDate: '2026-03-02',
                reason: 'Test Request'
            });
            console.log('Create result:', createRes);
            if (createRes.success) {
                await updateRequest(createRes.request.id);
            }
        } else {
            const req = res.requests[0];
            console.log(`Found request ${req.id} with status: ${req.status}`);
            await updateRequest(req.id);
        }

    } catch (e) {
        console.error('Test error:', e);
    }
}

async function updateRequest(id) {
    console.log(`Attempting to update request ${id} to 'approved'...`);
    const updateRes = await request('PUT', `/requests/${id}`, {
        status: 'approved',
        reviewNote: 'Test Approval Note',
        reviewedBy: 1, // Assuming ID 1 exists
        reviewedAt: new Date().toISOString()
    });
    console.log('Update response:', updateRes);
}

test();
