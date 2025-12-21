import Head from "next/head";
import Navigation from "../components/Navigation";
import Footer from "../components/Footer";

export default function Layout({ children }) {
  return (
    <div className="light-theme min-vh-100 d-flex flex-column" style={{ backgroundColor: 'var(--custom-bg-color, #fff3e0)' }}>
      <Head>
        <title>HeatManager - Intelligente Heizungssteuerung</title>
        <meta name="description" content="HeatManager - Ihr intelligentes System zur Heizungssteuerung und -überwachung" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
        <meta name="theme-color" content="#007bff" />
      </Head>
      
      <Navigation />
      
      <main className="flex-grow-1" style={{ backgroundColor: 'var(--custom-bg-color, #fff3e0)' }}>
        {children}
      </main>
      
      <Footer />
    </div>
  );
}
