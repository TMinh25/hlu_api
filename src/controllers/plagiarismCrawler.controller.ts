import puppeteer, { ElementHandle, WaitForSelectorOptions } from 'puppeteer';
import { NextFunction, Request, Response } from 'express';
import PlagiarismModel from '../interfaces/plagiarism';
import { removeBreadScrumbs, cleanDescription as cleanString } from '../utils';
import logger from '../config/logger';

const NAMESPACE = 'plagiarismCrawlerController';

const getDataFromResultsElement = (removeBreadScrumbs: Function, cleanString: Function) =>
	Array.from(document.querySelectorAll('div.result'), (element) => {
		const titleLink = element.querySelector('a.title');
		const descriptionSpan = element.querySelector('p > span.description');
		const similarPercentSpan = element.querySelector('p > span.info > span.rank > span.badge');
		const similarFoundSpan = element.querySelector('p > span.info > span.found > span.badge');
		return {
			plagTitle: removeBreadScrumbs(titleLink?.textContent),
			plagUrl: titleLink?.getAttribute('href'),
			plagDescription: cleanString(descriptionSpan?.textContent),
			similarityPercent: Number(similarPercentSpan?.textContent?.replace('%', '')),
			similarityFound: Number(similarFoundSpan?.textContent),
		};
	});

const crawlPlagium = async (req: Request, res: Response, next: NextFunction) => {
	var text: string = req.body.text;

	text = cleanString(text);

	if (text.split('').length > 1000) {
		res.status(400).json({ success: false, message: 'The paragraph length is limited to 1000 characters', message_vn: 'Đoạn văn giới hạn ở 1000 kí tự' });
	} else if (text.split('').length < 50) {
		res.status(400).json({ success: false, message: 'The paragraph is too short to find anything', message_vn: 'Đoạn văn quá ngắn để tìm dữ liệu' });
	}
	try {
		// Tạo trang mới trong tab ẩn danh
		const browser = await puppeteer.launch({ headless: false });
		const incognitoContext = await browser.createIncognitoBrowserContext();
		const page = await incognitoContext.newPage();
		await page.goto('https://www.plagium.com/');
		await page.setViewport({ height: 1080, width: 1080 });
		await page.type("textarea[id='text']", text);
		await page.click("button[id='btnQuickSearch']");

		// page.waitForFunction("document.querySelector('div#message').textContent.includes('Plagium did not find documents making use of the text that you entered.')").then(() => {
		// 	console.timeLog('hien roi ma');

		// 	return res.status(404).json({ success: true, data: null, message: 'Did not find any documents making use of the text', message_vn: 'Không tìm thấy tài liệu nào sử dụng đoạn văn bản' });
		// });
		const result = await page.evaluate("document.querySelector('div#message').textContent.includes('Plagium did not find documents making use of the text that you entered.')");

		if (result === true)
			return res.status(404).json({ success: true, data: null, message: 'Did not find any documents making use of the text', message_vn: 'Không tìm thấy tài liệu nào sử dụng đoạn văn bản' });

		// Đợi đến khi các kết quả hiện ra, thời gian timeout là 3 phút
		await page.waitForSelector('.result', {
			timeout: 180000,
			visible: true,
		});

		// Lấy dữ liệu từ các .result tìm được
		const data = await page.evaluate(() =>
			// document.querySelector('div#message').textContent.includes('Plagium did not find documents making use of the text that you entered.')
			{
				const falseResult = document.querySelector('div#message')?.textContent?.includes('Plagium did not find documents making use of the text that you entered.');
				if (falseResult) {
					return [];
				}

				return Array.from(document.querySelectorAll('div.result'), (element) => {
					const titleLink = element.querySelector('a.title');
					const descriptionSpan = element.querySelector('p > span.description');
					const similarPercentSpan = element.querySelector('p > span.info > span.rank > span.badge');
					const similarFoundSpan = element.querySelector('p > span.info > span.found > span.badge');
					return {
						plagTitle: titleLink?.textContent || '',
						plagUrl: titleLink?.getAttribute('href'),
						plagDescription: descriptionSpan?.textContent || '',
						similarityPercent: Number(similarPercentSpan?.textContent?.replace('%', '')),
						similarityFound: Number(similarFoundSpan?.textContent),
					};
				});
			},
		);

		if (data.length == 0) {
			// Không có bản đạo văn nào
			res.status(404).json({
				success: true,
				data: null,
				message: 'Did not find any documents making use of the text',
				message_vn: 'Không tìm thấy tài liệu nào sử dụng đoạn văn bản',
			});
		} else {
			// Chỉnh sửa lại dữ liệu lần cuối
			const finalData = data.map((element) => {
				return {
					...element,
					plagTitle: removeBreadScrumbs(element.plagTitle || ''),
					plagDescription: cleanString(element.plagDescription || ''),
				};
			}) as Array<PlagiarismModel>;
			// Trả về kết quả của các bản đạo văn
			res.status(200).json({
				success: true,
				data: finalData,
				length: finalData.length,
			});
		}
		// Đóng trình duyệt
		browser.close();
	} catch (error) {
		logger.error(NAMESPACE, 'error', error);
		return res.status(400).json({ success: false, error });
	}
	// return res.status(400).json({ success: false, message: 'try again' });
};

export default { crawlPlagium };
