import http from 'http';
import express from 'express';
import cors from 'cors';
import passport from 'passport';
import logging from './config/logger';
import config from './config/config';
import mongoose from 'mongoose';
import userRoutes from './routes/user.routes';
import authRoutes from './routes/auth.routes';
import covidCrawlerRoutes from './routes/covidCrawler.routes';

const NAMESPACE = 'Server';
const app = express();

// Connect to MongoDB
mongoose
	.connect(config.mongo.url, config.mongo.options)
	.then(async (res) => logging.info(NAMESPACE, 'Connected to MongoDB'))
	.catch((e) => {
		logging.error(NAMESPACE, e.message, e);
		process.exit(1);
	});

if (process.env.NODE_ENV === 'development') {
	// app.use(morgan('dev')); // use logger with morgan
	mongoose.set('debug', false);
}

// Logging the request
app.use((req, res, next) => {
	const { method, url } = req;

	logging.request(NAMESPACE, method, url);

	res.on('finish', () => {
		logging.response(NAMESPACE, method, url, res.statusCode);
	});

	next();
});

// Parse the request
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
var corsOptions = {
	origin: '*',
	optionsSuccessStatus: 200
};
app.use(cors());
app.use(passport.initialize());

// Routes
app.use('/user', userRoutes);
app.use('/auth', authRoutes);
app.use('/covid', covidCrawlerRoutes);

// Rules of API
app.use((req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	// res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

	if (req.method == 'OPTIONS') {
		res.header('Access-Control-Allow-Methods', 'GET PATCH DELETE POST PUT');
		return res.status(200).json({});
	}

	next();
});

// Error Handling
app.use((req, res, next) => {
	const error = new Error('not found');

	return res.status(404).json({
		message: error.message
	});
});

// Create the server
const httpServer = http.createServer(app);
httpServer.listen(config.server.port, () => logging.info(NAMESPACE, `Server running on ${config.server.hostname}:${config.server.port}`));
