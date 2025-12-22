-- Create quotes table for signin page
-- This table stores inspirational quotes about energy and sustainability

IF NOT EXISTS (
    SELECT * 
    FROM sys.tables 
    WHERE name = 'signin_quotes'
)
BEGIN
    CREATE TABLE signin_quotes (
        id INT IDENTITY(1,1) PRIMARY KEY,
        quote_text NVARCHAR(500) NOT NULL,
        author NVARCHAR(100) NOT NULL,
        author_title NVARCHAR(100) NULL,
        created_at DATETIME2 DEFAULT GETDATE(),
        is_active BIT DEFAULT 1
    );
    
    PRINT 'Table signin_quotes created successfully';
END
ELSE
BEGIN
    PRINT 'Table signin_quotes already exists';
END

-- Insert initial quotes
-- Check if quotes already exist
IF NOT EXISTS (SELECT 1 FROM signin_quotes)
BEGIN
    INSERT INTO signin_quotes (quote_text, author, author_title, is_active) VALUES
    ('Die beste Energie ist die, die wir nicht verbrauchen.', 'Angela Merkel', 'Ehemalige Bundeskanzlerin', 1),
    ('Energieeffizienz ist der Schlüssel zu einer nachhaltigen Zukunft.', 'Al Gore', 'Umweltschützer und Politiker', 1),
    ('Jede eingesparte Kilowattstunde ist ein Beitrag zum Klimaschutz.', 'Greta Thunberg', 'Klimaaktivistin', 1),
    ('Nachhaltigkeit bedeutet, dass wir heute so handeln, dass auch morgen noch Leben möglich ist.', 'Hans-Peter Dürr', 'Physiker und Umweltphilosoph', 1),
    ('Energie sparen ist nicht Verzicht, sondern Intelligenz.', 'Hermann Scheer', 'Politiker und Energieexperte', 1),
    ('Die Zukunft gehört denen, die heute schon an morgen denken.', 'Ernst Ulrich von Weizsäcker', 'Umweltwissenschaftler', 1),
    ('Klimaschutz ist keine Last, sondern eine Chance für Innovation.', 'Annalena Baerbock', 'Bundesaußenministerin', 1),
    ('Energieeffizienz ist die günstigste Energiequelle, die wir haben.', 'Fatih Birol', 'IEA-Direktor', 1),
    ('Wir müssen lernen, mit weniger mehr zu erreichen.', 'Ernst Bromeis', 'Wasserexperte', 1),
    ('Nachhaltigkeit ist kein Trend, sondern eine Notwendigkeit.', 'Jane Goodall', 'Primatenforscherin und Umweltaktivistin', 1),
    ('Die Energiewende ist eine gesellschaftliche Aufgabe, die wir gemeinsam meistern müssen.', 'Robert Habeck', 'Bundesminister für Wirtschaft und Klimaschutz', 1),
    ('Jeder kann einen Beitrag leisten - auch kleine Schritte führen zum Ziel.', 'Luisa Neubauer', 'Klimaaktivistin', 1),
    ('Energie sparen ist aktiver Klimaschutz.', 'Svenja Schulze', 'Ehemalige Bundesumweltministerin', 1),
    ('Die beste Zeit, Bäume zu pflanzen, war vor 20 Jahren. Die zweitbeste Zeit ist jetzt.', 'Chinesisches Sprichwort', NULL, 1),
    ('Wir haben die Erde nicht von unseren Eltern geerbt, wir haben sie von unseren Kindern geliehen.', 'Indianisches Sprichwort', NULL, 1);
    
    PRINT 'Initial quotes inserted successfully';
END
ELSE
BEGIN
    PRINT 'Quotes already exist in the table';
END


