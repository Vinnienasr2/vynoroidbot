-- Create telegram_files table to store file_id, caption, chat_id, and message_id
CREATE TABLE IF NOT EXISTS telegram_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_id VARCHAR(255) NOT NULL,
    caption TEXT,
    chat_id BIGINT NOT NULL,
    message_id BIGINT NOT NULL,
    media_type VARCHAR(32),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
