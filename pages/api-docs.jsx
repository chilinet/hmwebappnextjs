import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

function ApiDocs() {
  return (
    <div className="swagger-container">
      <SwaggerUI url="/swagger.json" />
      <style jsx global>{`
        /* Vollständig weiß: globales Hintergrundbild/Overlay aus globals.css abschalten */
        html {
          background: #ffffff !important;
          background-image: none !important;
        }
        body {
          background: #ffffff !important;
          background-color: #ffffff !important;
          background-image: none !important;
          background-size: auto !important;
          background-attachment: scroll !important;
        }
        body::before {
          display: none !important;
          content: none !important;
        }
        .swagger-container {
          margin: 0;
          padding: 0;
          min-height: 100vh;
          background-color: #ffffff;
        }
        .swagger-ui {
          max-width: 1460px;
          margin: 0 auto;
          padding: 20px;
          background-color: #ffffff;
        }
        .swagger-ui .info .title,
        .swagger-ui .info p,
        .swagger-ui .info table {
          color: #3b4151 !important;
        }
        .swagger-ui .scheme-container {
          background-color: white !important;
          box-shadow: 0 1px 2px 0 rgba(0,0,0,.15);
        }
        .swagger-ui section.models {
          background-color: white !important;
        }
        .swagger-ui .model-box {
          background-color: rgba(0,0,0,.1) !important;
        }
        /* Verbesserte Lesbarkeit für Beschreibungen */
        .swagger-ui .markdown p,
        .swagger-ui .markdown pre,
        .swagger-ui .renderedMarkdown p,
        .swagger-ui .renderedMarkdown pre {
          color: #3b4151 !important;
        }
        /* Bessere Sichtbarkeit für Methodenbezeichner */
        .swagger-ui .opblock .opblock-summary-method {
          color: white !important;
        }
        /* Verbesserte Darstellung der Modelle */
        .swagger-ui .model {
          color: #3b4151 !important;
        }
        .swagger-ui .model-title {
          color: #3b4151 !important;
        }
      `}</style>
    </div>
  );
}

export default ApiDocs; 