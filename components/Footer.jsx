import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHeart, faThermometerHalf } from "@fortawesome/free-solid-svg-icons";

export default function Footer() {
    const currentYear = new Date().getFullYear();
    
    return (
        <footer className="light-theme border-top mt-auto">
            <div className="container-fluid py-4">
                <div className="row align-items-center">
                    <div className="col-md-6">
                        <div className="d-flex align-items-center">
                            <FontAwesomeIcon 
                                icon={faThermometerHalf} 
                                className="text-primary me-2" 
                                size="lg"
                            />
                            <span className="text-muted">
                                © {currentYear} HeatManager. Alle Rechte vorbehalten.
                            </span>
                        </div>
                    </div>
                    <div className="col-md-6 text-md-end">
                        <div className="d-flex align-items-center justify-content-md-end gap-3">
                            <span className="text-muted small">
                                Intelligente Heizungssteuerung
                            </span>
                            <span className="text-muted small">
                                Made with <FontAwesomeIcon icon={faHeart} className="text-danger" /> in Germany
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}