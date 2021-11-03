import { Request, Response, NextFunction } from 'express';
import User from '../models/user.model';
import bcrypt from 'bcrypt';
import mongoose, { Schema } from 'mongoose';
import jwt from 'jsonwebtoken';
import config from '../config/config';
import logger from '../config/logger';
import { isValidObjectID } from '../utils';

const NAMESPACE = 'User Controller';

/**	Model RefreshToken dùng để thêm refreshToken vào cơ sở dữ liệu
 */
const RefreshToken = mongoose.model(
	'Refresh Token',
	new Schema(
		{
			token: { type: String, require: true, trim: true }
		},
		{
			versionKey: false
		}
	)
);

/** [GET]/user/
 * @returns
 * Trả về tất cả người dùng có trong cơ sở dữ liệu nếu không có người dùng nào trả về [null]
 *
 * [200]: Có người dùng trong cơ sở dữ liệu và trả về tất cả người dùng
 *
 * [404]: Người dùng không tồn tại trong cơ sở dữ liệu
 *
 * [500]: Lỗi mạng hoặc lỗi server
 */
const getAllUsers = (req: Request, res: Response, next: NextFunction) => {
	User.find({}, '_id studentID classID displayName DOB email phone role username photoURL')
		.exec()
		.then((userRes) => {
			if (userRes.length > 0) {
				res.status(200).json({ result: userRes, length: userRes.length });
			} else {
				res.status(404).json({ user: null, message: 'There are no user in the database' });
			}
		})
		.catch((error) =>
			res.status(500).json({
				message: error.message,
				e: error
			})
		);
};

/** [GET]/user/:_id
 * @param req.params
 * Chứa id của người dùng cần lấy
 * @returns
 *
 * Trả về người dùng có _id giống với _id truyền vào
 *
 * Kiểm tra _id có hợp lên hay không rồi mới tìm
 *
 * [200]: Người dùng tồn tại và trả về thông tin người dùng
 *
 * [400]: _id truyền vào không hợp lệ
 *
 * [500]: Lỗi mạng hoặc lỗi server
 */
const getUser = (req: Request, res: Response, next: NextFunction) => {
	if (!isValidObjectID(req.params._id)) {
		return res.status(400).json({ message: 'Invalid parameter' });
	}
	User.findOne({ _id: req.params._id }, '_id studentID classID displayName DOB email phone role username photoURL')
		.exec()
		.then((userRes) => {
			if (userRes === null) {
				res.status(404).json({ success: false, message: "Can't find user", message_vi: 'Không tìm thấy người dùng' });
			} else {
				res.status(200).json({ success: true, data: userRes });
			}
		})
		.catch((error) => res.status(500).json({ message: error.message, error: error }));
};

/** [GET]/user/score/:_id
 * @param req.params
 * Chứa id của người dùng cần xem điểm
 * @returns
 * Trả về điểm số của người dùng có _id giống với _id truyền vào
 *
 * Kiểm tra _id có hợp lên hay không rồi mới tìm
 *
 * [200]: Người dùng tồn tại và trả về điểm của người dùng
 *
 * [400]: _id truyền vào không hợp lệ
 *
 * [404]: Không tìm thấy người dùng
 *
 * [500]: Lỗi mạng hoặc lỗi server
 */
const getUserScore = (req: Request, res: Response, next: NextFunction) => {
	if (!isValidObjectID(req.params._id)) {
		return res.status(400).json({ message: 'Invalid parameter' });
	}
	User.findOne({ _id: req.params._id }, 'role studyScore curricularScore')
		.exec()
		.then((scoreRes) => {
			if (scoreRes === null) {
				res.status(404).json({ success: false, message: "Can't find user", message_vi: 'Không tìm thấy người dùng' });
			} else {
				if (scoreRes['role'] !== 4) {
					res.status(400).json({ success: false, message: 'User is not a student', message_vi: 'Người dùng không phải sinh viên' });
				} else {
					res.status(200).json({ success: true, data: scoreRes });
				}
			}
		})
		.catch((error) => res.status(500).json({ message: error.message, error: error }));
};

/** [POST]/user/find
 * @param req.body
 * Chứa 3 giá trị: studentID, email, username
 * @returns Trả về những người dùng có 3 giá trị chứa 3 giá trị bên trên
 *
 * [200]: Danh sách người dùng
 *
 * [404]: Không có người dùng nào được tìm thấy
 *
 * [500]: Lỗi mạng hoặc server
 */
const findUser = (req: Request, res: Response, next: NextFunction) => {
	const { studentID, email, displayName } = req.body;
	User.find({ studentID: RegExp(studentID, 'i'), email: RegExp(email, 'i'), displayName: RegExp(displayName, 'i') }, '_id studentID classID displayName DOB email phone role username photoURL')
		.then((result) => {
			if (result.length === 0) {
				return res.status(404).json({ message: 'No user found', length: 0 });
			}
			return res.status(200).json({ result, length: result.length });
		})
		.catch((error) => {
			logger.error(NAMESPACE, error.message, error);
			return res.status(500);
		});
};

/** [GET]/auth/signup	{body: User}
 * Tạo người dùng mới trong cơ sở dữ liệu
 *
 * Phải mã hóa mật khẩu của người dùng với salt = 10
 * @param req.body
 * Chứa thông tin người dùng truyền vào body của đường dẫn
 * @returns
 * [201]: Thành công tạo người dùng
 *
 * [409]: Người dùng có thông tin trùng lặp trong CSDL
 *
 * 				không cho phép 2 người dùng có 1 studentID
 *
 * 				không cho phép 2 người dùng có cùng 1 email
 *
 * 				nếu tài khoản là sinh viên thì phải có classID => phải thuộc về một lớp
 *
 * [500]: Lỗi mạng hoặc server
 */
const signUp = async (req: Request, res: Response, next: NextFunction) => {
	console.log(req.body);
	const { studentID, email, username, role, classID } = req.body;
	var emailExists = User.exists({ email: email });
	var usernameExists = User.exists({ username: username });
	var studentIDExists = User.exists({ studentID: studentID });
	Promise.all([emailExists, usernameExists, studentIDExists]).then((infoExists) => {
		if (infoExists[0]) {
			// email exists
			return res.status(409).json({ success: false, message: 'Email is already been taken', message_vi: 'Email đã tồn tại' });
		} else if (infoExists[1]) {
			// username exists
			return res.status(409).json({ success: false, message: 'Username is already been taken', message_vi: 'Tên tài khoản đã tồn tại' });
		} else if (infoExists[2]) {
			// studentID exists
			return res.status(409).json({ success: false, message: `Student ID ${studentID} is already exists`, message_vi: `Mã sinh viên ${studentID} đã tồn tại` });
		} else {
			if (role === 4 && classID == null) {
				// role = student but don't have a class
				return res.status(409).json({ success: false, message: 'Student has to belong to a class', message_vi: 'Sinh viên phải thuộc về một lớp' });
			} else {
				// sastified
				req.body.password = bcrypt.hashSync(req.body.password, 10);
				const user = new User({
					_id: new mongoose.Types.ObjectId(),
					...req.body
				});
				return user
					.save()
					.then((result) => {
						res.status(201).json({ success: true, data: result });
					})
					.catch((error) =>
						res.status(500).json({
							success: false,
							message: error.message
						})
					);
			}
		}
	});
};

/**	[DELETE]/auth/:_id
 * @param req.params
 * Chứa ID của người dùng cần xóa
 * @returns
 * [200]: Xóa người dùng thành công
 *
 * [400]: ID truyền vào không hợp lệ
 *
 * [404]: Người dùng không tồn tại
 *
 * [500]: Lỗi mạng hoặc server
 */
const deleteUser = async (req: Request, res: Response, next: NextFunction) => {
	const id = req.params._id;
	const userExists = await User.exists({ _id: id });

	return res.status(423).json({ message: 'this route is currently locked' });

	// if (!isValidObjectID(id)) {
	// 	return res.status(400).json({ success: false, message: 'Invalid id' });
	// } else if (!userExists) {
	// 	return res.status(404).json({ success: false, message: 'User does not exists in database' });
	// } else {
	// 	User.deleteOne({ _id: id })
	// 		.then((result) => {
	// 			if (result.deletedCount == 1) {
	// 				res.status(200).json({ success: true });
	// 			} else {
	// 				res.status(500).json({ success: false, message: 'Unable to remove user' });
	// 			}
	// 		})
	// 		.catch((error) => res.status(500).json({ success: false, message: error.message, error }));
	// }
};

/** [POST]/auth/signin
 * Nếu đăng nhập thành công => tạo accessToken để lấy thông tin người dùng
 * refreshToken để đăng nhập lại lần sau
 * cập nhật refreshToken vào trong cơ sở dữ liệu
 * @param req.body
 * Chứa object thông tin đăng nhập { username, password }
 * @returns
 * [200]: Đăng nhập thành công
 * 				Trả về trạng thái đăng nhập, accessToken, refreshToken
 *
 * [400]: Mật khẩu của tài khoản sai
 *
 * [404]: Tài khoản không tồn tại trong CSDL
 *
 * [500]: Lỗi mạng hoặc server
 */
const signIn = async (req: Request, res: Response, next: NextFunction) => {
	const { username, password } = req.body;
	console.warn(req.body);
	if (!username || !password) {
		return res.status(400).json({ authenticated: false, message: 'Username or password empty' });
	}
	try {
		const user = await User.findOne({ username: username }).collation({ locale: 'tr', strength: 2 }).exec();
		if (!user) {
			return res.status(404).send({ authenticated: false, message_vi: 'Người dùng không tồn tại!', message: 'Could not find user!' });
		}
		if (!bcrypt.compareSync(password, user.password)) {
			return res.status(400).send({ authenticated: false, message_vi: 'Mật khẩu của tài khoản không đúng', message: 'Password incorrect!' });
		}
		const userInfomation = user?.userInfomation();
		const accessToken = user?.generateAccessToken();
		const refreshToken = jwt.sign({ data: userInfomation }, config.jwt_key);
		await RefreshToken.findOneAndUpdate({ _id: user._id }, { token: refreshToken }, { new: true, upsert: true });
		res.status(200).send({ authenticated: true, accessToken, refreshToken });
	} catch (error) {
		res.status(500).json({ authenticated: false, error });
	}
};

/** [GET]/auth/access-token
 * @param req.body:
 * Chứa refreshToken để tạo accessToken mới để đăng nhập
 * @returns
 * [200]: accessToken và refreshToken mới
 *
 * [403]: bị cấm do refreshToken truyền vào không hợp lệ, hoặc lỗi xác thực token
 *
 * [500]: Lỗi mạng hoặc server
 */
const getAccessToken = (req: Request, res: Response, next: NextFunction) => {
	const authHeader = req.headers.authorization;
	if (authHeader && authHeader.split(' ')[0] === 'Bearer') {
		const oldRefreshToken = authHeader.split(' ')[1];
		if (oldRefreshToken == null) return res.status(401).send({ success: false, message_vi: 'Token không hợp lệ', message: 'Invalid token' });
		RefreshToken.exists({ token: oldRefreshToken })
			.then(async (isTokenExists) => {
				if (!isTokenExists) {
					res.status(403).send({ success: false, message_vi: 'Token không hợp lệ', message: 'Invalid token' });
				} else {
					var decoded = jwt.verify(oldRefreshToken, config.jwt_key, {
						algorithms: ['HS512', 'HS256']
					});
					// Tìm user với _id đã giải mã
					const user = await User.findOne({ _id: (<any>decoded).data._id }).exec();
					const userInfomation = user?.userInfomation();
					const accessToken = user?.generateAccessToken();
					const newRefreshToken = jwt.sign({ data: userInfomation }, config.jwt_key);
					// Cập nhật refreshToken trong cơ sở dữ liệu
					await RefreshToken.updateOne({ token: oldRefreshToken }, { token: newRefreshToken });
					return res.status(200).json({ success: true, accessToken, refreshToken: newRefreshToken });
				}
			})
			.catch((error) => res.status(500).json(error));
	} else {
		return res.status(401).json({ success: false, message_vi: 'Không thể tìm thông tin tài khoản', message: 'Could not find infomation about your account' });
	}
};

/** [GET]/auth/info
 * @param req.headers
 * [Authorization]: Bearer *accessToken
 * @returns
 *
 * [200]: Trả về thông tin cá nhân của người dùng
 *
 * [403]: Lỗi giải mã accessToken
 *
 * [400]: Token truyền vào lỗi hoặc không có headers Authorization
 */
const authInfo = (req: Request, res: Response, next: NextFunction) => {
	const authHeader = req.headers.authorization;
	if (authHeader && authHeader.split(' ')[0] === 'Bearer') {
		const accessToken = authHeader.split(' ')[1];

		jwt.verify(
			accessToken,
			config.jwt_key,
			{
				algorithms: ['HS512', 'HS256']
			},
			(error, user) => {
				if (error) {
					logger.error(NAMESPACE, error?.message);
					return res.status(403).send({ success: false, message: error?.message });
				}
				return res.status(200).json({ success: true, data: user });
			}
		);
	} else {
		return res.status(400).json({ success: false, message_vi: 'Token lỗi', message: 'Invalid token' });
	}
};

/** [DELETE]/auth/logout
 * @param req.body
 * chứa refreshToken của tài khoản cần đăng xuất
 * @returns
 *
 * [200]: Đăng xuất thành công, xóa refreshToken khỏi CSDL
 *
 * [403]: Không có refreshToken được lưu trong CSDL, bị cấm
 *
 * [400]: Không thể đăng xuất hoặc xóa refreshToken khỏi CSDL
 */
const logout = (req: Request, res: Response, next: NextFunction) => {
	const refreshToken = req.body.refreshToken;
	RefreshToken.countDocuments({ token: refreshToken }, (error, count) => {
		if (count > 0) {
			RefreshToken.deleteMany({ token: refreshToken }, (ok) => {
				console.log(ok);
				if (!ok) {
					return res.status(200).send({ success: true, message_vi: 'Đăng xuất thành công', message: 'Sign out successfully' });
				} else {
					return res.status(400).send({ success: false, message: 'Unable to log out' });
				}
			});
		} else {
			next();
			return res.status(403);
		}
	});
};

export default { getAllUsers, getUser, getUserScore, findUser, signIn, getAccessToken, logout, authInfo, signUp, deleteUser };