function Error({ statusCode }) {
  return (
    <p>
      {statusCode
        ? `Ein ${statusCode} Fehler ist aufgetreten auf dem Server`
        : 'Ein Fehler ist im Client aufgetreten'}
    </p>
  )
}

Error.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default Error 