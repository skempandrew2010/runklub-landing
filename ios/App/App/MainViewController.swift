import UIKit
import Capacitor
import WebKit

// @capacitor/ios's own WebViewDelegationHandler unconditionally disables
// pinch-to-zoom (see WebViewDelegationHandler.scrollViewWillBeginZooming -
// it force-sets scrollView.pinchGestureRecognizer.isEnabled = false on every
// zoom attempt). capacitorDidLoad() is Capacitor's documented hook for
// exactly this kind of post-setup customization: it runs after `webView`
// is set but before the page loads, so we swap in our own scroll delegate
// that allows zooming instead of Capacitor's default one disabling it.
class MainViewController: CAPBridgeViewController {
    private var zoomDelegate: WebViewZoomDelegate?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let webView = webView else { return }
        let delegate = WebViewZoomDelegate(webView: webView)
        zoomDelegate = delegate
        webView.scrollView.delegate = delegate
        webView.scrollView.minimumZoomScale = 1.0
        webView.scrollView.maximumZoomScale = 3.0
    }
}

private class WebViewZoomDelegate: NSObject, UIScrollViewDelegate {
    private weak var webView: WKWebView?

    init(webView: WKWebView) {
        self.webView = webView
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        return webView
    }
}
