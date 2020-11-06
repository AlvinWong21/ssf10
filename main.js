//load libraries
const express = require('express')
const handlebars = require('express-handlebars')
const fetch = require('node-fetch')
const withQuery = require('with-query').default
const mysql = require('mysql2/promise')
const morgan = require('morgan')

//configure PORT
const PORT = parseInt(process.argv[2]) || parseInt(process.env.PORT) || 3000

//configure API key
const PUB_API_KEY = process.env.PUB_API_KEY || ""

//create database connection pool
const pool = mysql.createPool({
	host: process.env.DB_HOST,
	port: parseInt(process.env.DB_PORT) || 3306,
	database: process.env.DB_NAME,
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	connectionLimit: 4
})

//SQL statements
const SQL_BOOK_LETTER = 'select * from book2018 where title like ? order by title asc limit ? offset ?';
const SQL_BOOK_LETTER_COUNT = 'select count(*) as book_count from book2018 where title like ?';
const SQL_BOOK_ID = 'select * from book2018 where book_id like ?';

//create an instance of express
const app = express()

//configure handlebars
app.engine('hbs', handlebars({defaultLayout: 'default.hbs'}))
app.set('view engine', 'hbs')

//morgan
app.use(morgan('combined'))

//apps
app.get('/', (req, resp) => {
    resp.status(200)
    resp.type('text/html')
    resp.render('index')
})

app.get('/:bookInit', async (req, resp) => {
    //get book initial and get connection to database
    const searchLetter = req.params['bookInit']
    const conn = await pool.getConnection()

    //get offset value from letter.hbs
    const offset = parseInt(req.query['offset'] || 0)

    //set limit
    const limit = 10

    //get book count of book initial
    let bookCount = await conn.query(SQL_BOOK_LETTER_COUNT, [searchLetter+'%'])
    bookCount = bookCount[0][0].book_count

    //calculate total page number
    const pageTotal = Math.ceil(bookCount / limit)
    let pageNum = Math.ceil(Math.max(1, (offset/limit + 1)))
    let prevOffset = Math.max(0, offset - limit)
    let nextOffset = offset + limit
    let firstPage = (pageNum <= 1)
    let lastPage = (pageNum >= pageTotal)

    console.info(bookCount)
    try {
        //SQL query for book starting with :bookInit
        const sqlResults = await conn.query(SQL_BOOK_LETTER, [searchLetter+'%', limit, offset])
        
        //take out the results from the query results array
        const resultsLetter = sqlResults[0] //.map(d => [d.title, b.id])

        console.info(resultsLetter)
        console.info(firstPage, lastPage)

        resp.status(200)
        resp.type('text/html')
        resp.render('letter', {
            resultsLetter, 
            searchLetter,
            pageTotal,
            pageNum,
            prevOffset,
            nextOffset, /*Math.min((offset + limit), (bookCount - limit)),*/
            firstPage,
            lastPage
        })
    } catch(e) {
        resp.status(500)
        resp.type('text/html')
        resp.send(JSON.stringify(e))

    } finally {
        conn.release()
    }

})

app.get('/info/:bookId', async (req, resp) => {
    //get book_id and get connection to database
    const bookId = req.params['bookId']
    const conn = await pool.getConnection()

    try {
        //search for book info in database
        let bookResults = await conn.query(SQL_BOOK_ID, [bookId])

        //take out the results from the query results array
        bookResults = bookResults[0][0]
        console.info(bookResults)

        //retrieve genres as comma separated list
        const genres = bookResults.genres
        console.info(genres)
        const genresList = genres.replaceAll("|", ", ")
        console.info(genresList)

        resp.status(200)
        // resp.type('text/html')
        resp.format({
            'text/html': () => {
                resp.render('info', {bookResults, genresList})
            },
            'application/json': () => {
                resp.render('info', {bookResults, genresList})
            },
            'default': () => {
                resp.status(406)
                resp.send('Not Acceptable')
            }
        })
        // resp.render('info', {bookResults, genresList})

    } catch(e) {
        resp.status(500)
        resp.type('text/html')
        resp.send(JSON.stringify(e))
    } finally {
        conn.release()
    }

})

app.get('/reviews/:bkTitle/:bkAuthor', async (req, resp) => {
    const bookTitle = req.params['bkTitle']
    const bookAuthor = req.params['bkAuthor']
    const moreBookAuthor = bookAuthor.replaceAll("|", " and ")

    const baseUrl = "https://api.nytimes.com/svc/books/v3/reviews.json"
    
    console.info(bookTitle)
    console.info(bookAuthor)
    let url = withQuery(
        baseUrl,
        {
            title: bookTitle,
            author: moreBookAuthor,
            "api-key": PUB_API_KEY
        }
    )
    console.info(url)
    
    let result = await fetch(url)
    result = await result.json()
    let bookReview = result.results
    console.info(result)
    console.info(bookReview)

    const resultCount = result.num_results

    resp.status(200)
    resp.type('text.html')
    resp.render('reviews', {result, bookReview, resultCount})
})

//start app server
pool.getConnection()
    .then(conn => {
        console.info('Pinging database.')
        const p0 = Promise.resolve(conn)
        const p1 = conn.ping()
        return Promise.all([p0, p1])
    })
    .then(results => {
        const conn = results[0]
        conn.release()
       app.listen(PORT, () => {
           console.info('Database alive.')
        console.info(`Application started at port ${PORT} on ${new Date()}.`)
        }) 
    })
    .catch(e => {
        console.error('Cannot start server: ', e)
    })