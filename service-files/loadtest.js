const http = require('http');
const assert = require('assert');
const path = require('path');

const endPoint = 'Restau-LB8A1-c4kz6zh2C3Jm-2133662552.us-east-1.elb.amazonaws.com';
const port = 80;

// Function to make HTTP requests
const makeRequest = (options, postData = null) => {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                resolve({ statusCode: res.statusCode, data: data });
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        if (postData) {
            req.write(postData);
        }

        req.end();
    });
};

// Test for DELETE /restaurants/:restaurantName
const testDeleteRestaurant = async (restaurantName) => {
    
    console.log('restaurantName:', restaurantName);
    
    // Delete the restaurant
    const optionsDelete = {
        hostname: endPoint,
        port: port,
        path: `/restaurants/${restaurantName}`,
        method: 'DELETE'
    };
    console.log('DELETE /restaurants options:', optionsDelete);
    const responseDelete = await makeRequest(optionsDelete);
    console.log(`DELETE /restaurants/${restaurantName} response:`, responseDelete);
    assert.strictEqual(responseDelete.statusCode, 200, 'Expected status code 200');

    // Try to get the deleted restaurant
    const optionsGet = {
        hostname: endPoint,
        port: port,
        path: `/restaurants/${restaurantName}`,
        method: 'GET'
    };
    const responseGet = await makeRequest(optionsGet);
    console.log(`GET /restaurants/${restaurantName} after delete response:`, responseGet);
    assert.strictEqual(responseGet.statusCode, 404, 'Expected status code 404 for a deleted restaurant');
};

// Function to generate multiple restaurants
const generateRestaurants = (count) => {
    const restaurants = [];
    for (let i = 1; i <= count; i++) {
        restaurants.push({
            name: `TestRestaurant${i}`,
            cuisine: 'Italian',
            region: 'North'
        });
    }
    return restaurants;
};

// Test for POST /restaurants
const testPostRestaurant = async (restaurant) => {
    const restaurantData = JSON.stringify(restaurant);
    const options = {
        hostname: endPoint,
        port: port,
        path: '/restaurants',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(restaurantData)
        }
    };
    console.log('POST /restaurants options:', options);
    const response = await makeRequest(options, restaurantData);
    console.log('POST /restaurants response:', response);
    assert.strictEqual(response.statusCode, 200, 'Expected status code 200');
};

// Test for GET /restaurants/:restaurantName
const testGetRestaurant = async (restaurant) => {
    const options = {
        hostname: endPoint,
        port: port,
        path: `/restaurants/${restaurant.name}`,
        method: 'GET'
    };
    const response = await makeRequest(options);
    assert.strictEqual(response.statusCode, 200, 'Expected status code 200');
    console.log(`GET /restaurants/${restaurant.name} response:`, response);
    const data = JSON.parse(response.data);
    assert.strictEqual(data.name, restaurant.name, `Expected restaurant name to be ${restaurant.name}`);
    assert.strictEqual(data.cuisine, restaurant.cuisine, `Expected restaurant cuisine to be ${restaurant.cuisine}`);
    assert.strictEqual(data.region, restaurant.region, `Expected restaurant region to be ${restaurant.region}`);
    
};

// Function to generate ratings for the restaurants
const generateRatings = (restaurants) => {
    return restaurants.map(restaurant => ({
        name: restaurant.name,
        rating: parseFloat((Math.random() * 5).toFixed(1))
    }));
};

// Test for POST /restaurants/rating
const testPostRestaurantRating = async (ratingData) => {
    
    const ratingDataJSON = JSON.stringify(ratingData);
    console.log('ratingDataJSON:', ratingDataJSON);
    const options = {
        hostname: endPoint,
        port: port,
        path: '/restaurants/rating',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(ratingDataJSON)
        }
    };
    
    const response = await makeRequest(options, ratingDataJSON);
    console.log('POST /restaurants/rating response:', response);
    assert.strictEqual(response.statusCode, 200, 'Expected status code 200');
};

// Test for GET /restaurants/cuisine/:cuisine
const testGetRestaurantsByCuisine = async (cuisine, limit) => {
    const options = {
        hostname: endPoint,
        port: port,
        path: `/restaurants/cuisine/${cuisine}?limit=${limit}`,
        method: 'GET'
    };
    const response = await makeRequest(options);
    assert.strictEqual(response.statusCode, 200, 'Expected status code 200');
    const data = JSON.parse(response.data);
    assert(data.length <= limit, `Expected no more than ${limit} restaurants`);

    // Check that the restaurants are sorted by rating in descending order
    for (let i = 0; i < data.length - 1; i++) {
        assert(data[i].rating >= data[i + 1].rating, 'Restaurants are not sorted by rating in descending order');
    }
    
    return data;
};

// Test for GET /restaurants/region/:region
const testGetRestaurantsByRegion = async (region, limit) => {
    const options = {
        hostname: endPoint,
        port: port,
        path: `/restaurants/region/${region}?limit=${limit}`,
        method: 'GET'
    };

    const response = await makeRequest(options);
    assert.strictEqual(response.statusCode, 200, 'Expected status code 200');
    const data = JSON.parse(response.data);
    assert(data.length <= limit, `Expected no more than ${limit} restaurants`);

    // Check that the restaurants are sorted by rating in descending order
    for (let i = 0; i < data.length - 1; i++) {
        assert(data[i].rating >= data[i + 1].rating, 'Restaurants are not sorted by rating in descending order');
    }

    return data;
}

// Function to run all tests and measure total response time
const runTests = async () => {
    const restaurants = generateRestaurants(100);
    console.log('restaurants:', restaurants);
    
    for (const restaurant of restaurants) {
        await testPostRestaurant(restaurant);
    }

    const ratings = generateRatings(restaurants);
    console.log('ratings:', ratings);

    for (const rating of ratings) {
        await testPostRestaurantRating(rating);
    }

    const start = Date.now();

    for (const restaurant of restaurants) {
        await testGetRestaurant(restaurant);
    }
    
    const end = Date.now();
    const duration = end - start;
    console.log(`Total time to complete all responses: ${duration} ms`);


    const cuisine = 'Italian';
    var limit = 12;
    await testGetRestaurantsByCuisine(cuisine, limit);

    const region = 'North';
    limit = 15;
    await testGetRestaurantsByRegion(region, limit);

    // Test delete restaurant
     const restaurantToDelete = 'TestRestaurant99'; 
     await testDeleteRestaurant(restaurantToDelete);

};

// Run all tests
runTests().catch(console.error);
