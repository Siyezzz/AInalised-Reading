-- 导入的电子书需要在服务端保留「已抽取的正文」，因为当前没有对象存储绑定，
-- 原始二进制不落库；改写流程只依赖正文文本。
ALTER TABLE shelf_books ADD COLUMN extracted_text TEXT;
