const express = require('express');
const RestaurantsMemcachedActions = require('./model/restaurantsMemcachedActions');

var AWS = require("aws-sdk");
var ddb =  new AWS.DynamoDB.DocumentClient();

const app = express();
app.use(express.json());

const MEMCACHED_CONFIGURATION_ENDPOINT = process.env.MEMCACHED_CONFIGURATION_ENDPOINT;
const TABLE_NAME = process.env.TABLE_NAME;
const AWS_REGION = process.env.AWS_REGION;
const USE_CACHE = process.env.USE_CACHE === 'true';

const memcachedActions = new RestaurantsMemcachedActions(MEMCACHED_CONFIGURATION_ENDPOINT);

app.get('/', (req, res) => {
    const response = {
        MEMCACHED_CONFIGURATION_ENDPOINT: MEMCACHED_CONFIGURATION_ENDPOINT,
        TABLE_NAME: TABLE_NAME,
        AWS_REGION: AWS_REGION,
        // USE_CACHE: USE_CACHE
    };
    res.send(response);
});

app.post('/restaurants', async (req, res) => {
    const restaurant = req.body;
    
    // Check cache first
    if (USE_CACHE) {
        const cacheResponse = await memcachedActions.getRestaurants(restaurant.name);
        if (cacheResponse) { // If cache hit, return the response
            return res.status(409).send({ success: false, message: 'Restaurant already exists' });
        }
    }
    
    var params = {
        TableName: TABLE_NAME,
        Key: {
            name: restaurant.name,
        }
    };
    const data = await ddb.get(params).promise();
    if (data.Item) {
        return res.status(409).send({ success: false, message: 'Restaurant already exists' });
    } else {
        const putParams = {
            TableName: TABLE_NAME,
            Item: {
                name: restaurant.name,
                cuisine: restaurant.cuisine,
                region: restaurant.region,
                rating: 0
            }
        };
        await ddb.put(putParams).promise();
        // Update cache
        if (USE_CACHE) {
            await memcachedActions.addRestaurants(restaurant.name, putParams.Item);
        }
        res.send({ success: true });
    }
});

app.get('/restaurants/:restaurantName', async (req, res) => {
    const restaurantName = req.params.restaurantName;
    
    // Checking cache first
    if (USE_CACHE) {
        const cacheResponse = await memcachedActions.getRestaurants(restaurantName);
        if (cacheResponse) { // If cache hit, return the response
            return res.status(200).send( { name: cacheResponse.name, cuisine: cacheResponse.cuisine, rating: cacheResponse.rating, region: cacheResponse.region});
        }
    }

    var params = {
        TableName: TABLE_NAME,
        Key: {
            name: restaurantName
        }
    };
    const data = await ddb.get(params).promise(); // Check if restaurant exists in DynamoDB and return it
    if (data.Item) {
        res.status(200).send({ name: data.Item.name, cuisine: data.Item.cuisine, rating: data.Item.rating, region: data.Item.region });
    } else {
        res.status(404).send({ success: false, message: 'Restaurant not found' });
    }
});

app.delete('/restaurants/:restaurantName', async (req, res) => {
    const restaurantName = req.params.restaurantName;
    var params = {
        TableName: TABLE_NAME,
        Key: {
            name: restaurantName
        }
    };

    // Delete from cache
    if (USE_CACHE) {
        await memcachedActions.deleteRestaurants(restaurantName);
    }
    
    ddb.delete(params, function(err, data) {
        if (err) {
            res.status(404).send({ success: false, message: 'Restaurant not found' });
        } else {
            res.status(200).send({ success: true });
        }
    });
});

app.post('/restaurants/rating', async (req, res) => {
    const restaurantName = req.body.name;
    const rating = req.body.rating;
    
    // Retrieve current restaurant data
    var getParams = {
        TableName: TABLE_NAME,
        Key: {
            name: restaurantName
        }
    };

    try {
        const data = await ddb.get(getParams).promise();
        if (!data.Item) { // Check if restaurant exists in DynamoDB
            return res.status(404).send({ success: false, message: 'Restaurant not found' });
        }

        const currentRating = data.Item.rating || 0;
        const numRatings = data.Item.numRatings || 0;

        // Calculate new average rating
        const updatedRating = ((currentRating * numRatings) + rating) / (numRatings + 1);
        const updatedNumRatings = numRatings + 1;

        // Update restaurant with new rating and numRatings
        var updateParams = {
            TableName: TABLE_NAME,
            Key: {
                name: restaurantName
            },
            UpdateExpression: "set rating = :r, numRatings = :n",
            ExpressionAttributeValues: {
                ":r": updatedRating,
                ":n": updatedNumRatings
            },
            ReturnValues: "UPDATED_NEW"
        };

        const updateData = await ddb.update(updateParams).promise();

        // Update cache
        if (USE_CACHE) {
            const updatedRestaurant = { ...data.Item, rating: updatedRating, numRatings: updatedNumRatings };
            await memcachedActions.addRestaurants(updatedRestaurant.name, updatedRestaurant);
        }

        res.status(200).send({ success: true });

    } catch (err) {
        res.status(400).send({ success: false, message: 'Error updating rating', error: err.message });
    }
});

app.get('/restaurants/cuisine/:cuisine', async (req, res) => {
    const cuisine = req.params.cuisine;
    let limit = req.query.limit;
    
    // Validate and adjust limit
    if (limit) {
        limit = parseInt(limit);
        if (limit < 10) limit = 10;
        else if (limit > 100) limit = 100;
    }
    
    // Filter restaurants by cuisine
    var params = {
        TableName: TABLE_NAME,
        FilterExpression: "#cuisine = :cuisine",
        ExpressionAttributeNames: {
            "#cuisine": "cuisine"
        },
        ExpressionAttributeValues: {
            ":cuisine": cuisine
        }
    };

    try {
        const data = await ddb.scan(params).promise();
        const restaurants = data.Items;

        // Sort restaurants by rating in descending order
        restaurants.sort((a, b) => b.rating - a.rating);

        // Apply the limit if specified
        const limitedRestaurants = limit ? restaurants.slice(0, limit) : restaurants;

        // Format response
        const response = limitedRestaurants.map(restaurant => ({
            name: restaurant.name,
            cuisine: restaurant.cuisine,
            rating: restaurant.rating,
            region: restaurant.region
        }));

        res.status(200).send(response);
    } catch (err) {
        res.status(400).send({ success: false, message: 'Error getting restaurants', error: err.message });
    }
});

app.get('/restaurants/region/:region', async (req, res) => {
    const region = req.params.region;
    let limit = req.query.limit;
    
    // Validate and adjust limit
    if (limit) {
        limit = parseInt(limit);
        if (limit < 10) limit = 10;
        else if (limit > 100) limit = 100;
    }
    
    // Filter restaurants by region
    var params = {
        TableName: TABLE_NAME,
        FilterExpression: "#region = :region",
        ExpressionAttributeNames: {
            "#region": "region"
        },
        ExpressionAttributeValues: {
            ":region": region
        }
    };

    try {
        const data = await ddb.scan(params).promise();
        const restaurants = data.Items;

        // Sort restaurants by rating in descending order
        restaurants.sort((a, b) => b.rating - a.rating);

        // Apply the limit if specified
        const limitedRestaurants = limit ? restaurants.slice(0, limit) : restaurants;

        // Format response
        const response = limitedRestaurants.map(restaurant => ({
            name: restaurant.name,
            cuisine: restaurant.cuisine,
            rating: restaurant.rating,
            region: restaurant.region
        }));

        res.status(200).send(response);
    } catch (err) {
        res.status(400).send({ success: false, message: 'Error getting restaurants', error: err.message });
    }
});

app.get('/restaurants/region/:region/cuisine/:cuisine', async (req, res) => {
    const region = req.params.region;
    const cuisine = req.params.cuisine;
    let limit = req.query.limit;

    // Validate and adjust limit
    if (limit) {
        limit = parseInt(limit);
        if (limit < 10) limit = 10;
        else if (limit > 100) limit = 100;
    }

    var params = {
        TableName: TABLE_NAME,
        FilterExpression: "#region = :region and #cuisine = :cuisine",
        ExpressionAttributeNames: {
            "#region": "region",
            "#cuisine": "cuisine"
        },
        ExpressionAttributeValues: {
            ":region": region,
            ":cuisine": cuisine
        }
    };

    try {
        const data = await ddb.scan(params).promise();
        const restaurants = data.Items;

        // Sort restaurants by rating in descending order
        restaurants.sort((a, b) => b.rating - a.rating);

        // Apply the limit if specified
        const limitedRestaurants = limit ? restaurants.slice(0, limit) : restaurants;

        // Format response
        const response = limitedRestaurants.map(restaurant => ({
            name: restaurant.name,
            cuisine: restaurant.cuisine,
            rating: restaurant.rating,
            region: restaurant.region
        }));

        res.status(200).send(response);
    } catch (err) {
        res.status(400).send({ success: false, message: 'Error getting restaurants', error: err.message });
    }
});

app.listen(80, () => {
    console.log('Server is running on http://localhost:80');
});

module.exports = { app };