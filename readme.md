## This project is on Web Scrapping and Automation for a Hackathon organised by Pepcoding.

#### It aims to provide users with the information of COVID-19 vaccine centres nearest to them.

```
The users have to input their Address, Pincode and E-mail ID. 
Information of vaccine centres is then fetched in the the area specific to their pincode. 
For each vaccine centre found near the user, a screenshot of the route is taken in PNG format, 
the directions to that centre are stored in a PDF file, the route map is stored as a HTML file and the route link will be put in a JSON file. 
Finally, the names of all nearest vaccine centres found, along with their address 
and a link to Google Map route are e-mailed to the user. 
This makes it super convenient and quick for users to get information regarding vaccine centres. 
```

##### Tech Stack Used :
- Javascript
- Node.js
- [Puppeteer](https://www.npmjs.com/package/puppeteer)
- HTML
- CSS
- [Nodemailer](https://nodemailer.com/about/)