/**
 * PDF generator utility
 */
const PDFDocument = require('pdfkit');
const moment = require('moment');

/**
 * Generate a PDF document with transaction details
 * @param {Array} transactions - List of transactions
 * @param {Object} user - User details
 * @returns {Buffer} PDF buffer
 */
const generatePDF = async (transactions, user) => {
  return new Promise((resolve, reject) => {
    try {
      const buffers = [];
      const doc = new PDFDocument({
        size: 'A4',
        info: {
          Title: 'Transaction History',
          Author: 'Movie Bot',
          Subject: 'User Transaction Report',
          Keywords: 'transactions, movies, series',
          Creator: 'Movie Bot System',
          Producer: 'PDFKit',
          pdfVersion: '1.7',
          encrypt: {
            ownerPassword: 'admin-password',
            userPassword: user.telegram_id.toString().slice(-6),
            permissions: {
              printing: 'highResolution',
              modifying: false,
              copying: false,
              annotating: false,
              fillingForms: false,
              contentAccessibility: true,
              documentAssembly: false
            }
          }
        }
      });
      
      // Collect PDF chunks
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      
      // Add logo or title
      doc
        .fontSize(20)
        .text('Movie Bot - Transaction History', { align: 'center' })
        .moveDown();
      
      // Add user info
      doc
        .fontSize(12)
        .text(`User ID: ${user.id}`, { align: 'left' })
        .text(`Username: ${user.username || 'N/A'}`, { align: 'left' })
        .text(`Name: ${user.first_name || ''} ${user.last_name || ''}`, { align: 'left' })
        .text(`Date: ${moment().format('YYYY-MM-DD HH:mm:ss')}`, { align: 'left' })
        .moveDown(2);
      
      // Add table header
      const tableTop = 200;
      const columnSpacing = 15;
      
      // Draw table header
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Transaction ID', 50, tableTop, { width: 100 })
        .text('Date', 150, tableTop, { width: 80 })
        .text('Type', 230, tableTop, { width: 60 })
        .text('Content', 290, tableTop, { width: 100 })
        .text('Amount', 390, tableTop, { width: 80 })
        .text('Status', 470, tableTop, { width: 80 });
      
      // Draw a line below the header
      doc
        .moveTo(50, tableTop + 15)
        .lineTo(550, tableTop + 15)
        .stroke();
      
      // Draw table rows
      let rowY = tableTop + 25;
      doc.font('Helvetica');
      
      transactions.forEach((transaction, i) => {
        // Add a new page if necessary
        if (rowY > 700) {
          doc.addPage();
          rowY = 50;
          
          // Add column headers to new page
          doc
            .fontSize(10)
            .font('Helvetica-Bold')
            .text('Transaction ID', 50, rowY, { width: 100 })
            .text('Date', 150, rowY, { width: 80 })
            .text('Type', 230, rowY, { width: 60 })
            .text('Content', 290, rowY, { width: 100 })
            .text('Amount', 390, rowY, { width: 80 })
            .text('Status', 470, rowY, { width: 80 });
          
          // Draw a line below the header
          doc
            .moveTo(50, rowY + 15)
            .lineTo(550, rowY + 15)
            .stroke();
          
          rowY += 25;
          doc.font('Helvetica');
        }
        
        // Format date
        const date = moment(transaction.created_at).format('YYYY-MM-DD');
        
        // Format content title
        const contentTitle = transaction.content_title || 'Unknown';
        const episodeRange = transaction.episode_range ? ` (${transaction.episode_range})` : '';
        
        // Format transaction code (show only last 6 digits)
        const transactionCode = `...${transaction.transaction_code.slice(-6)}`;
        
        // Draw row
        doc
          .fontSize(9)
          .text(transactionCode, 50, rowY, { width: 100 })
          .text(date, 150, rowY, { width: 80 })
          .text(transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1), 230, rowY, { width: 60 })
          .text(`${contentTitle}${episodeRange}`, 290, rowY, { width: 100 })
          .text(`KES ${parseFloat(transaction.amount).toFixed(2)}`, 390, rowY, { width: 80 })
          .text(transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1), 470, rowY, { width: 80 });
        
        // Draw line between rows
        if (i < transactions.length - 1) {
          doc
            .moveTo(50, rowY + 15)
            .lineTo(550, rowY + 15)
            .stroke();
        }
        
        rowY += 25;
      });
      
      // Add summary at the bottom
      const totalAmount = transactions.reduce((sum, transaction) => {
        return sum + parseFloat(transaction.amount);
      }, 0);
      
      rowY += 10;
      
      doc
        .font('Helvetica-Bold')
        .text('Total Amount:', 350, rowY, { width: 80 })
        .text(`KES ${totalAmount.toFixed(2)}`, 430, rowY, { width: 80 });
      
      // Add footer
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        
        // Draw footer
        doc
          .fontSize(8)
          .text(
            `Generated on ${moment().format('YYYY-MM-DD HH:mm:ss')} - Page ${i + 1} of ${pageCount}`,
            50,
            doc.page.height - 50,
            { align: 'center', width: doc.page.width - 100 }
          );
      }
      
      // Finalize PDF
      doc.end();
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      reject(error);
    }
  });
};

module.exports = { generatePDF };